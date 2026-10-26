/** @type {import('tailwindcss').Config} */
// Colors are defined once in src/theme.css (CSS variables); this file only
// gives them Tailwind names. Edit values in theme.css, not here.
const v = (name) => `var(--color-${name})`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Tailwind's default grays/reds/etc. collapsed onto the theme tokens so
        // legacy text-gray-*/bg-red-* classes follow the same palette.
        gray: {
          300: '#8b8b8b',
          400: '#8b8b8b',
          500: v('ink2'),
          600: v('ink2'),
          700: v('ink'),
          800: v('ink'),
          900: v('ink'),
        },
        red: {
          50: v('danger-light'),
          100: v('danger-light'),
          200: v('danger-light'),
          300: v('danger-light'),
          400: v('danger'),
          500: v('danger'),
          600: v('danger'),
        },
        green: {
          400: '#20b657',
          500: '#20b657',
          600: '#20b657',
        },
        amber: {
          400: '#ffb123',
          500: '#ffb123',
          600: v('warn'),
        },
        yellow: {
          400: '#ffb123',
        },

        page: v('page'),
        surface: v('surface'),
        selected: v('selected'),
        line: v('line'),
        ink: v('ink'),
        'ink-hover': v('ink-hover'),
        ink2: v('ink2'),
        muted: v('muted'),
        placeholder: v('placeholder'),
        icon: v('icon'),
        'filter-label': v('filter-label'),
        hover: v('hover'),

        primary: v('primary'),
        'primary-hover': v('primary-hover'),

        accent: v('accent'),
        'accent-hover': v('accent-hover'),
        'accent-light': v('accent-light'),
        'accent-border': v('accent-border'),
        'accent-active': v('accent-active'),

        'warn-light': v('warn-light'),
        warn: v('warn'),
        'success-light': v('success-light'),
        success: v('success'),
        'danger-light': v('danger-light'),
        danger: v('danger'),

        destructive: v('destructive'),
        'destructive-hover': v('destructive-hover'),

        user: v('user'),
        company: v('company'),
        'company-light': v('company-light'),

        field: v('field'),
        'field-hover': v('field-hover'),
      },
    },
  },
  plugins: [],
}
