
export const theme = {
    text: {
        primary: '', // Default foreground
        secondary: '#6C7086',
        link: '#89B4FA',
        accent: '#CBA6F7',
        response: '', // Default foreground
    },
    background: {
        primary: '#1E1E2E',
        diff: {
            added: '#28350B',
            removed: '#430000',
        },
    },
    border: {
        default: '#6C7086',
        focused: '#89B4FA',
    },
    ui: {
        comment: '#6C7086',
        symbol: '#6C7086',
        dark: '#45485A', // Interpolated 0.5 between gray and bg
        gradient: ['#4796E4', '#847ACE', '#C3677F'],
    },
    status: {
        error: '#F38BA8',
        success: '#A6E3A1',
        warning: '#F9E2AF',
    },
};
