tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
            },
            colors: {
                // Aliasing the pink classes to white/gray to seamlessly remove pink theming across the app
                pink: {
                    400: '#e5e5e5', // Light gray for text accents
                    500: '#ffffff', // Pure white for main primary elements
                    600: '#d4d4d4', // Slightly darker gray for hover states
                },
                // High-contrast pitch-black theme
                slate: {
                    50: '#ffffff',
                    100: '#f5f5f5',
                    200: '#e5e5e5',
                    300: '#d4d4d4',
                    400: '#a3a3a3',
                    500: '#737373',
                    600: '#404040',
                    700: '#1a1a1a', // Borders, subtle hovers, dividers
                    800: '#0a0a0a', // Elevated surfaces (modals, sidebars, headers)
                    900: '#000000', // Deep black for inputs and sub-backgrounds
                    950: '#000000', // Pure pitch black for main app background
                }
            }
        }
    }
}