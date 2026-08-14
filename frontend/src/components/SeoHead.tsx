import { useEffect } from 'react'

interface SeoHeadProps {
  title: string
  description?: string
  image?: string
  path?: string
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// Per-route document head: title, description, and social share tags.
// The landing route's defaults are also statically present in index.html so
// crawlers and link-preview scrapers see them without running the SPA.
export default function SeoHead({ title, description, image, path }: SeoHeadProps) {
  useEffect(() => {
    document.title = title

    if (description) {
      upsertMeta('name', 'description', description)
      upsertMeta('property', 'og:description', description)
      upsertMeta('name', 'twitter:description', description)
    }
    if (image) {
      upsertMeta('property', 'og:image', image)
      upsertMeta('name', 'twitter:image', image)
    }
    if (path) {
      upsertMeta('property', 'og:url', path)
      upsertMeta('name', 'twitter:url', path)
    }
  }, [title, description, image, path])

  return null
}
