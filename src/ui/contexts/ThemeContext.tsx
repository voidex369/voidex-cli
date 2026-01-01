/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Theme, themes, defaultTheme } from '../themes/index.js';

interface ThemeContextType {
    theme: Theme;
    setTheme: (name: string) => void;
    availableThemes: string[];
}

const ThemeContext = createContext<ThemeContextType>({
    theme: defaultTheme,
    setTheme: () => { },
    availableThemes: [],
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentTheme, setCurrentTheme] = useState<Theme>(defaultTheme);

    const setThemeName = (name: string) => {
        if (themes[name]) {
            setCurrentTheme(themes[name]);
        }
    };

    return (
        <ThemeContext.Provider value={{
            theme: currentTheme,
            setTheme: setThemeName,
            availableThemes: Object.keys(themes)
        }}>
            {children}
        </ThemeContext.Provider>
    );
};
