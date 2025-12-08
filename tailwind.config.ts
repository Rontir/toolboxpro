import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                // Original ToolBox Pro Green Theme
                'bg-primary': '#0a0a0a',
                'bg-secondary': '#141414',
                'bg-tertiary': '#1c1c1c',
                'bg-hover': '#262626',
                'border': '#2a2a2a',
                'accent': '#22c55e',
                'accent-hover': '#16a34a',
                'text-primary': '#fafafa',
                'text-secondary': '#a3a3a3',
                'text-muted': '#737373',
            },
            boxShadow: {
                'glow': '0 0 20px rgba(34, 197, 94, 0.3)',
                'glow-lg': '0 0 30px rgba(34, 197, 94, 0.4)',
            },
            borderRadius: {
                'sm': '6px',
                'md': '10px',
                'lg': '16px',
            },
        },
    },
    plugins: [],
};
export default config;
