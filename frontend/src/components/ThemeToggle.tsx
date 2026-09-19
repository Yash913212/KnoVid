import { motion } from 'motion/react'
import { Moon, Sun } from 'lucide-react'
import { flushSync } from 'react-dom'
import { useTheme } from '../context/ThemeContext'
import { transitions } from '../lib/motion'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Fallback for browsers that don't support View Transitions API
    if (!document.startViewTransition) {
      toggleTheme()
      return
    }

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        toggleTheme()
      })
    })
  }

  return (
    <motion.button
      type="button"
      onClick={handleToggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      whileTap={{ scale: 0.92 }}
      className="theme-toggle"
    >
      <motion.span
        key={theme}
        initial={{ rotate: -60, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={transitions.content}
        className="grid place-items-center"
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </motion.span>
    </motion.button>
  )
}
