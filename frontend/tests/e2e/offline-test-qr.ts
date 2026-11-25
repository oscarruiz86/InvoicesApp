const alphanumeric = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function appendBits(bits: boolean[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index--) bits.push(((value >>> index) & 1) !== 0);
}

function multiply(x: number, y: number): number {
  let result = 0;
  for (let index = 0; index < 8; index++) {
    if ((y & 1) !== 0) result ^= x;
    const high = (x & 0x80) !== 0;
    x = (x << 1) & 0xff;
    if (high) x ^= 0x1d;
    y >>>= 1;
  }
  return result;
}

function divisor(degree: number): number[] {
  const result: number[] = Array.from({ length: degree }, (_, index) => index === degree - 1 ? 1 : 0);
  let root = 1;
  for (let index = 0; index < degree; index++) {
    for (let coefficient = 0; coefficient < degree; coefficient++) {
      result[coefficient] = multiply(result[coefficient], root);
      if (coefficient + 1 < degree) result[coefficient] ^= result[coefficient + 1];
    }
    root = multiply(root, 2);
  }
  return result;
}

function codewords(text: string): boolean[] {
  const bits: boolean[] = [];
  appendBits(bits, 0b0010, 4);
  appendBits(bits, text.length, 9);
  for (let index = 0; index + 1 < text.length; index += 2) {
    const value = alphanumeric.indexOf(text[index]) * 45 + alphanumeric.indexOf(text[index + 1]);
    appendBits(bits, value, 11);
  }
  if (text.length % 2) appendBits(bits, alphanumeric.indexOf(text.at(-1)!), 6);
  appendBits(bits, 0, Math.min(4, 152 - bits.length));
  while (bits.length % 8) bits.push(false);
  const data: number[] = [];
  for (let index = 0; index < bits.length; index += 8) data.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | Number(bit), 0));
  for (let pad = 0; data.length < 19; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);

  const coefficients = divisor(7), remainder = Array<number>(7).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1); remainder[6] = 0;
    for (let index = 0; index < remainder.length; index++) remainder[index] ^= multiply(coefficients[index], factor);
  }
  return [...data, ...remainder].flatMap(value => Array.from({ length: 8 }, (_, index) => ((value >>> (7 - index)) & 1) !== 0));
}

export function createVersionOneQr(text: string): boolean[][] {
  if (!text || text.length > 25 || [...text].some(character => !alphanumeric.includes(character))) throw new Error('QR fixture requires up to 25 QR alphanumeric characters');
  const size = 21;
  const matrix = Array.from({ length: size }, () => Array<boolean | null>(size).fill(null));
  const setFunction = (x: number, y: number, dark: boolean) => { if (x >= 0 && y >= 0 && x < size && y < size) matrix[y][x] = dark; };
  const finder = (left: number, top: number) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      setFunction(left + dx, top + dy, distance !== 2 && distance <= 3);
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  for (let index = 8; index < size - 8; index++) {
    setFunction(index, 6, index % 2 === 0);
    setFunction(6, index, index % 2 === 0);
  }

  const formatData = 0b01000;
  let remainder = formatData << 10;
  for (let bit = 14; bit >= 10; bit--) if (((remainder >>> bit) & 1) !== 0) remainder ^= 0x537 << (bit - 10);
  const format = ((formatData << 10) | remainder) ^ 0x5412;
  for (let index = 0; index <= 5; index++) setFunction(8, index, ((format >>> index) & 1) !== 0);
  setFunction(8, 7, ((format >>> 6) & 1) !== 0); setFunction(8, 8, ((format >>> 7) & 1) !== 0); setFunction(7, 8, ((format >>> 8) & 1) !== 0);
  for (let index = 9; index < 15; index++) setFunction(14 - index, 8, ((format >>> index) & 1) !== 0);
  for (let index = 0; index < 8; index++) setFunction(size - 1 - index, 8, ((format >>> index) & 1) !== 0);
  for (let index = 8; index < 15; index++) setFunction(8, size - 15 + index, ((format >>> index) & 1) !== 0);
  setFunction(8, size - 8, true);

  const data = codewords(text);
  let bitIndex = 0, upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (matrix[y][x] !== null) continue;
        let dark = bitIndex < data.length ? data[bitIndex] : false;
        bitIndex++;
        if ((x + y) % 2 === 0) dark = !dark;
        matrix[y][x] = dark;
      }
    }
    upward = !upward;
  }
  return matrix.map(row => row.map(Boolean));
}
