const {
  DatabaseEnvChangeToken,
  LanguageEnvChangeToken,
  CharsetEnvChangeToken,
  PacketSizeEnvChangeToken,
  BeginTransactionEnvChangeToken,
  CommitTransactionEnvChangeToken,
  RollbackTransactionEnvChangeToken,
  DatabaseMirroringPartnerEnvChangeToken,
  ResetConnectionEnvChangeToken,
  RoutingEnvChangeToken,
  CollationChangeToken
} = require('./token');

const types = {
  1: {
    name: 'DATABASE',
    event: 'databaseChange'
  },
  2: {
    name: 'LANGUAGE',
    event: 'languageChange'
  },
  3: {
    name: 'CHARSET',
    event: 'charsetChange'
  },
  4: {
    name: 'PACKET_SIZE',
    event: 'packetSizeChange'
  },
  7: {
    name: 'SQL_COLLATION',
    event: 'sqlCollationChange'
  },
  8: {
    name: 'BEGIN_TXN',
    event: 'beginTransaction'
  },
  9: {
    name: 'COMMIT_TXN',
    event: 'commitTransaction'
  },
  10: {
    name: 'ROLLBACK_TXN',
    event: 'rollbackTransaction'
  },
  13: {
    name: 'DATABASE_MIRRORING_PARTNER',
    event: 'partnerNode'
  },
  17: {
    name: 'TXN_ENDED'
  },
  18: {
    name: 'RESET_CONNECTION',
    event: 'resetConnection'
  },
  20: {
    name: 'ROUTING_CHANGE',
    event: 'routingChange'
  }
};

function readNewAndOldValue(parser, length, type, callback) {
  switch (type.name) {
    case 'DATABASE':
    case 'LANGUAGE':
    case 'CHARSET':
    case 'PACKET_SIZE':
    case 'DATABASE_MIRRORING_PARTNER':
      return parser.readBVarChar((newValue) => {
        parser.readBVarChar((oldValue) => {
          switch (type.name) {
            case 'PACKET_SIZE':
              return callback(new PacketSizeEnvChangeToken(parseInt(newValue), parseInt(oldValue)));

            case 'DATABASE':
              return callback(new DatabaseEnvChangeToken(newValue, oldValue));

            case 'LANGUAGE':
              return callback(new LanguageEnvChangeToken(newValue, oldValue));

            case 'CHARSET':
              return callback(new CharsetEnvChangeToken(newValue, oldValue));

            case 'DATABASE_MIRRORING_PARTNER':
              return callback(new DatabaseMirroringPartnerEnvChangeToken(newValue, oldValue));
          }
        });
      });

    case 'SQL_COLLATION':
    case 'BEGIN_TXN':
    case 'COMMIT_TXN':
    case 'ROLLBACK_TXN':
    case 'RESET_CONNECTION':
      return parser.readBVarByte((newValue) => {
        parser.readBVarByte((oldValue) => {
          switch (type.name) {
            case 'SQL_COLLATION':
              return callback(new CollationChangeToken(newValue, oldValue));

            case 'BEGIN_TXN':
              return callback(new BeginTransactionEnvChangeToken(newValue, oldValue));

            case 'COMMIT_TXN':
              return callback(new CommitTransactionEnvChangeToken(newValue, oldValue));

            case 'ROLLBACK_TXN':
              return callback(new RollbackTransactionEnvChangeToken(newValue, oldValue));

            case 'RESET_CONNECTION':
              return callback(new ResetConnectionEnvChangeToken(newValue, oldValue));
          }
        });
      });

    case 'ROUTING_CHANGE':
      return parser.readUInt16LE((valueLength) => {
        // Routing Change:
        // Byte 1: Protocol (must be 0)
        // Bytes 2-3 (USHORT): Port number
        // Bytes 4-5 (USHORT): Length of server data in unicode (2byte chars)
        // Bytes 6-*: Server name in unicode characters
        parser.readBuffer(valueLength, (routePacket) => {
          const protocol = routePacket.readUInt8(0);

          if (protocol !== 0) {
            return parser.emit('error', new Error('Unknown protocol byte in routing change event'));
          }

          const port = routePacket.readUInt16LE(1);
          const serverLen = routePacket.readUInt16LE(3);
          // 2 bytes per char, starting at offset 5
          const server = routePacket.toString('ucs2', 5, 5 + (serverLen * 2));

          const newValue = {
            protocol: protocol,
            port: port,
            server: server
          };

          parser.readUInt16LE((oldValueLength) => {
            parser.readBuffer(oldValueLength, (oldValue) => {
              callback(new RoutingEnvChangeToken(newValue, oldValue));
            });
          });
        });
      });
  }
}

module.exports = function(parser, colMetadata, options, callback) {
  parser.readUInt16LE((length) => {
    parser.readUInt8((typeNumber) => {
      const type = types[typeNumber];

      if (!type) {
        console.error('Tedious > Unsupported ENVCHANGE type ' + typeNumber);
        // skip unknown bytes
        return parser.readBuffer(length - 1, () => {
          callback();
        });
      }

      readNewAndOldValue(parser, length, type, (token) => {
        callback(token);
      });
    });
  });
};
