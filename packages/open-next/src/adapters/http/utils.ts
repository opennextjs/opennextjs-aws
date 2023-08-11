export function getString(data: any) {
  // Note: use `ArrayBuffer.isView()` to check for Uint8Array. Using
  //       `instanceof Uint8Array` returns false in some cases. For example,
  //       when the buffer is created in middleware and passed to NextServer.
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  } else if (ArrayBuffer.isView(data)) {
    //@ts-ignore
    return Buffer.from(data).toString('utf8');
  } else if (typeof data === 'string') {
    return data;
  } else {
    throw new Error(`response.getString() of unexpected type: ${typeof data}`);
  }
}

export const headerEnd = '\r\n\r\n';
