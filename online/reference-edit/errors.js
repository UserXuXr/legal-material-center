export class EditError extends Error {
  constructor(message, code = 'edit') {
    super(message);
    this.name = 'EditError';
    this.code = code;
  }
}

export const LIMITS = {pdfBytes: 20 * 1024 * 1024, zipBytes: 40 * 1024 * 1024, pages: 30};

export function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new EditError('文件内容不是二进制数据', 'corrupt');
}
