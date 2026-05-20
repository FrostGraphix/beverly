type QRCodeErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
type QRCodeMode = 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji';
type QRCodeTypeNumber =
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
    | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
    | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30
    | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40;

interface QRCodeInstance {
    addData(data: string, mode?: QRCodeMode): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
    createSvgTag(opts?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
}

interface QRCodeFactory {
    (typeNumber: QRCodeTypeNumber, errorCorrectionLevel: QRCodeErrorCorrectionLevel): QRCodeInstance;
}

declare const qrcode: QRCodeFactory;
export default qrcode;
