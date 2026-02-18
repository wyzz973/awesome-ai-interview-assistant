import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface StreamingTextProps {
  text: string
}

export default function StreamingText({ text }: StreamingTextProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
      <span className="inline-block w-2 h-4 bg-accent-primary animate-pulse ml-0.5 align-text-bottom" />
    </div>
  )
}
