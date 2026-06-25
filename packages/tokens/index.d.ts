export declare const brand: {
    50: string;
    100: string;
    300: string;
    500: string;
    600: string;
    700: string;
    glow: string;
};

export declare const semantic: {
    accent: string;
    info: string;
    warn: string;
    danger: string;
    success: string;
};

export declare const motion: {
    easeOut: string;
    easeInOut: string;
    easeSpring: string;
    durFast: number;
    durBase: number;
    durSlow: number;
};

export declare const fontStacks: {
    sans: string;
    mono: string;
};

export declare function setTheme(name: 'dark' | 'light' | string): void;
export declare function initTheme(defaultName?: string): void;
export declare function toggleTheme(): void;
