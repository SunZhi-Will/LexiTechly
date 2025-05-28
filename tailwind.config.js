/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#1a73e8',
                'primary-hover': '#1557b0',
            }
        },
    },
    plugins: [],
    darkMode: 'class',
} 