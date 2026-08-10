import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'

interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  color: string
}

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const particleCount = Math.min(80, Math.floor((window.innerWidth * window.innerHeight) / 15000))
    const newParticles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.5 ? '#FF6B35' : '#D946EF',
    }))

    const animate = () => {
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of newParticles) {
        p.x += p.speedX
        p.y += p.speedY

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Draw connections
      for (let i = 0; i < newParticles.length; i++) {
        for (let j = i + 1; j < newParticles.length; j++) {
          const dx = newParticles[i].x - newParticles[j].x
          const dy = newParticles[i].y - newParticles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(newParticles[i].x, newParticles[i].y)
            ctx.lineTo(newParticles[j].x, newParticles[j].y)
            ctx.strokeStyle = newParticles[i].color
            ctx.globalAlpha = (1 - dist / 120) * 0.15
            ctx.lineWidth = 0.5
            ctx.stroke()
            ctx.globalAlpha = 1
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#0a0a0a]" />
      <canvas ref={canvasRef} className="absolute inset-0" />
      <motion.div
        className="absolute -left-72 -top-72 h-[58rem] w-[58rem] rounded-full bg-[radial-gradient(ellipse_at_center,_#FF6B35_0%,_transparent_70%)] blur-[180px] opacity-15"
        animate={{ x: [0, 180, -60, 0], y: [0, 90, 160, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-80 top-[4%] h-[62rem] w-[62rem] rounded-full bg-[radial-gradient(ellipse_at_center,_#D946EF_0%,_transparent_70%)] blur-[180px] opacity-15"
        animate={{ x: [0, -150, 80, 0], y: [0, 160, 40, 0] }}
        transition={{ duration: 34, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-80 left-[18%] h-[60rem] w-[74rem] rounded-full bg-[radial-gradient(ellipse_at_center,_#FF6B35_0%,_transparent_70%)] blur-[180px] opacity-15"
        animate={{ x: [0, 120, -100, 0], y: [0, -140, -40, 0] }}
        transition={{ duration: 38, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="ambient-grid absolute inset-0" />
    </div>
  )
}
