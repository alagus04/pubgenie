import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Article {
  pmid: string
  title: string
  abstract: string
  authors: string
  journal: string
  publication_year: string
}

interface Props {
  pmid: string | null
  onClose: () => void
}

export default function ArticleViewer({ pmid, onClose }: Props) {
  const [article, setArticle] = useState<Article | null>(null)

  useEffect(() => {
    if (!pmid) return
    const fetchArticle = async () => {
      const res = await fetch(`/api/article?pmid=${pmid}`)
      const data = await res.json()
      setArticle(data.article)
    }
    fetchArticle()
  }, [pmid])

  return (
    <Dialog open={!!pmid} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>PMID: {pmid}</DialogTitle>
        </DialogHeader>
        {article ? (
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{article.title}</h2>
            <p className="text-sm text-gray-600 italic">{article.authors}</p>
            <p className="text-sm">{article.journal} ({article.publication_year})</p>
            <p className="mt-2">{article.abstract}</p>
          </div>
        ) : (
          <p>Loading article details...</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
