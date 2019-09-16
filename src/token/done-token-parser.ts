import Parser from './stream-parser';
import { ColumnMetadata } from './colmetadata-token-parser'
import { ConnectionOptions } from '../connection';
import { Token } from './token';

// s2.2.7.5/6/7

const STATUS = {
  MORE: 0x0001,
  ERROR: 0x0002,
  // This bit is not yet in use by SQL Server, so is not exposed in the returned token
  INXACT: 0x0004,
  COUNT: 0x0010,
  ATTN: 0x0020,
  SRVERROR: 0x0100
};

function parseToken(parser: Parser, options: ConnectionOptions, callback: (token: Token) => void) {
  parser.readUInt16LE((status) => {
    const more = !!(status & STATUS.MORE);
    const sqlError = !!(status & STATUS.ERROR);
    const rowCountValid = !!(status & STATUS.COUNT);
    const attention = !!(status & STATUS.ATTN);
    const serverError = !!(status & STATUS.SRVERROR);

    parser.readUInt16LE((curCmd) => {
      (options.tdsVersion < '7_2' ? parser.readUInt32LE : parser.readUInt64LE).call(parser, (rowCount) => {
        callback({
          name: 'DONE',
          event: 'done',
          more: more,
          sqlError: sqlError,
          attention: attention,
          serverError: serverError,
          rowCount: rowCountValid ? rowCount : undefined,
          curCmd: curCmd
        });
      });
    });
  });
}

export function doneParser(parser: Parser, _colMetadata: ColumnMetadata[], options: ConnectionOptions, callback: (token: Token) => void) {
  parseToken(parser, options, (token) => {
    token.name = 'DONE';
    token.event = 'done';
    callback(token);
  });
}

export function doneInProcParser(parser: Parser, _colMetadata: ColumnMetadata[], options: ConnectionOptions, callback: (token: Token) => void) {
  parseToken(parser, options, (token) => {
    token.name = 'DONEINPROC';
    token.event = 'doneInProc';
    callback(token);
  });
}

export function doneProcParser(parser: Parser, _colMetadata: ColumnMetadata[], options: ConnectionOptions, callback: (token: Token) => void) {
  parseToken(parser, options, (token) => {
    token.name = 'DONEPROC';
    token.event = 'doneProc';
    callback(token);
  });
}
