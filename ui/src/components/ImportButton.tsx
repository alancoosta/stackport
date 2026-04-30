import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { readFileAsJson, importSQSQueues, importSNSTopics, importS3Buckets } from '@/lib/import'
import type { ImportResult } from '@/lib/import'

const importFns: Record<string, (data: unknown[]) => Promise<ImportResult>> = {
  sqs: importSQSQueues,
  sns: importSNSTopics,
  s3: importS3Buckets,
}

const serviceLabels: Record<string, string> = {
  sqs: 'queues',
  sns: 'topics',
  s3: 'buckets',
}

interface ImportButtonProps {
  service: 'sqs' | 'sns' | 's3'
  onComplete: () => void
}

export function ImportButton({ service, onComplete }: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const importFn = importFns[service]
  const label = serviceLabels[service]

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so same file can be re-imported
    if (inputRef.current) inputRef.current.value = ''

    try {
      const data = await readFileAsJson(file)
      if (data.length === 0) {
        toast.error('Import failed', { description: 'File contains no data' })
        return
      }

      const result = await importFn(data)

      if (result.failed.length === 0) {
        toast.success(`Imported ${result.successful} ${label}`)
      } else if (result.successful > 0) {
        toast.warning(`Imported ${result.successful} ${label}, ${result.failed.length} failed`, {
          description: result.failed.map((f) => `${f.name}: ${f.error}`).join('\n'),
        })
      } else {
        toast.error(`Import failed`, {
          description: result.failed.map((f) => `${f.name}: ${f.error}`).join('\n'),
        })
      }

      if (result.successful > 0) onComplete()
    } catch (e) {
      toast.error('Import failed', {
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={`Import ${label}`}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
      </Button>
    </>
  )
}
