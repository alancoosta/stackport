import {
  createSNSTopic,
  createS3Bucket,
  createSQSQueuesBatch,
} from './api'
import type { S3CreateBucketRequest, SQSCreateQueueRequest, SNSCreateTopicRequest } from './types'

export interface ImportResult {
  successful: number
  failed: Array<{ name: string; error: string }>
}

function readFileAsJson(file: File): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        if (!Array.isArray(parsed)) {
          reject(new Error('File must contain a JSON array'))
          return
        }
        resolve(parsed)
      } catch {
        reject(new Error('Invalid JSON file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export async function importSQSQueues(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { successful: 0, failed: [] }

  const queues: SQSCreateQueueRequest[] = data.map((item) => {
    const q = item as Record<string, unknown>
    const req: SQSCreateQueueRequest = {
      queueName: String(q.name || ''),
      queueType: q.type === 'FIFO' ? 'FIFO' : 'Standard',
    }
    if (typeof q.visibilityTimeout === 'number') req.visibilityTimeout = q.visibilityTimeout
    if (typeof q.messageRetentionPeriod === 'number') req.messageRetentionPeriod = q.messageRetentionPeriod
    if (typeof q.delaySeconds === 'number') req.delaySeconds = q.delaySeconds
    if (q.tags && typeof q.tags === 'object') req.tags = q.tags as Record<string, string>
    return req
  }).filter((q) => q.queueName)

  // Process in batches of 10
  for (let i = 0; i < queues.length; i += 10) {
    const chunk = queues.slice(i, i + 10)
    try {
      const response = await createSQSQueuesBatch({ queues: chunk })
      result.successful += response.successful.length
      result.failed.push(...response.failed)
    } catch (e) {
      for (const q of chunk) {
        result.failed.push({ name: q.queueName, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  return result
}

export async function importSNSTopics(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { successful: 0, failed: [] }

  for (const item of data) {
    const t = item as Record<string, unknown>
    const name = String(t.name || '')
    if (!name) {
      result.failed.push({ name: '', error: 'Missing name' })
      continue
    }

    const req: SNSCreateTopicRequest = {
      name,
      fifo: t.type === 'FIFO',
    }
    if (t.displayName) req.displayName = String(t.displayName)
    if (t.tags && typeof t.tags === 'object') req.tags = t.tags as Record<string, string>

    try {
      await createSNSTopic(req)
      result.successful++
    } catch (e) {
      result.failed.push({ name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return result
}

export async function importS3Buckets(data: unknown[]): Promise<ImportResult> {
  const result: ImportResult = { successful: 0, failed: [] }

  for (const item of data) {
    const b = item as Record<string, unknown>
    const name = String(b.name || '')
    if (!name) {
      result.failed.push({ name: '', error: 'Missing name' })
      continue
    }

    const req: S3CreateBucketRequest = { name }

    try {
      await createS3Bucket(req)
      result.successful++
    } catch (e) {
      result.failed.push({ name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return result
}

export { readFileAsJson }
