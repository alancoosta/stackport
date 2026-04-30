import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Breadcrumb, createHomeSegment } from '@/components/Breadcrumb'
import {
  fetchSNSTopics,
  fetchSNSTopicDetail,
  createSNSTopic,
  deleteSNSTopic,
  fetchSNSSubscriptions,
  createSNSSubscription,
  deleteSNSSubscription,
  updateSNSSubscriptionAttributes,
  publishSNSMessage,
  publishSNSMessagesBatch,
  updateResourceTags,
} from '@/lib/api'
import type {
  SNSTopic,
  SNSTopicDetail,
  SNSSubscription,
  SNSPublishRequest,
  SNSCreateTopicRequest,
  SNSSubscribeRequest,
  SNSBatchPublishRequest,
} from '@/lib/types'
import { useEndpoint } from '@/hooks/useEndpoint'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { ExportDropdown } from '@/components/ExportDropdown'
import { ImportButton } from '@/components/ImportButton'
import { JsonViewer } from '@/components/JsonViewer'
import { useFetch } from '@/hooks/useFetch'
import { TagsSection, TagCountBadge } from '@/components/TagsSection'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Bell,
  Send,
  Trash2,
  Search,
  Plus,
  Filter,
  UserCheck,
  Smartphone,
  Megaphone,
  FileJson,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Edit,
} from 'lucide-react'

function TopicTypeBadge({ type }: { type: 'Standard' | 'FIFO' }) {
  const color = type === 'FIFO' ? 'bg-purple-500' : 'bg-orange-500'
  return (
    <Badge variant="secondary" className={`${color} text-white`}>
      {type}
    </Badge>
  )
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const colors: Record<string, string> = {
    http: 'bg-blue-500',
    https: 'bg-green-500',
    email: 'bg-yellow-500',
    'email-json': 'bg-orange-500',
    sqs: 'bg-pink-500',
    lambda: 'bg-purple-500',
    application: 'bg-indigo-500',
    sms: 'bg-teal-500',
  }
  const color = colors[protocol.toLowerCase()] || 'bg-gray-500'
  return (
    <Badge variant="secondary" className={`${color} text-white`}>
      {protocol}
    </Badge>
  )
}

function SubscriptionStatusBadge({ status }: { status: 'pending' | 'confirmed' | 'deleted' }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    confirmed: 'default',
    pending: 'secondary',
    deleted: 'outline',
  }
  return (
    <Badge variant={variants[status] || 'secondary'}>
      {status}
    </Badge>
  )
}

// ============================================================================
// Create Topic Sheet
// ============================================================================

function CreateTopicSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [topicName, setTopicName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [fifo, setFifo] = useState(false)
  const [contentBasedDeduplication, setContentBasedDeduplication] = useState(false)
  const [kmsMasterKeyId, setKmsMasterKeyId] = useState('')
  const [tags, setTags] = useState<Record<string, string>>({})
  const [tagKey, setTagKey] = useState('')
  const [tagValue, setTagValue] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!topicName.trim()) {
      toast.error('Topic name is required')
      return
    }

    try {
      setCreating(true)
      const request: SNSCreateTopicRequest = {
        name: topicName.trim(),
        displayName: displayName || undefined,
        fifo,
        contentBasedDeduplication: fifo ? contentBasedDeduplication : undefined,
        kmsMasterKeyId: kmsMasterKeyId || undefined,
      }
      if (Object.keys(tags).length > 0) {
        request.tags = tags
      }

      await createSNSTopic(request)
      toast.success(`Topic created: ${request.name}`)

      // Reset form
      setTopicName('')
      setDisplayName('')
      setFifo(false)
      setContentBasedDeduplication(false)
      setKmsMasterKeyId('')
      setTags({})
      setTagKey('')
      setTagValue('')

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(`Failed to create topic: ${error}`)
    } finally {
      setCreating(false)
    }
  }

  const addTag = () => {
    if (tagKey.trim() && tagValue.trim()) {
      setTags({ ...tags, [tagKey.trim()]: tagValue.trim() })
      setTagKey('')
      setTagValue('')
    }
  }

  const removeTag = (key: string) => {
    const newTags = { ...tags }
    delete newTags[key]
    setTags(newTags)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create SNS Topic
          </SheetTitle>
          <SheetDescription>Create a new SNS topic for publishing messages</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="topic-name">Topic Name *</Label>
            <Input
              id="topic-name"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="my-topic"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Alphanumeric, hyphens, and underscores. FIFO topics must end with <code>.fifo</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Topic"
            />
            <p className="text-xs text-muted-foreground">
              Human-readable name for the topic (optional)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="fifo">FIFO Topic</Label>
              <p className="text-xs text-muted-foreground">
                Enable first-in-first-out message ordering
              </p>
            </div>
            <Switch id="fifo" checked={fifo} onCheckedChange={setFifo} />
          </div>

          {fifo && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="content-dedup">Content-Based Deduplication</Label>
                <p className="text-xs text-muted-foreground">
                  Deduplicate based on message body SHA-256 hash
                </p>
              </div>
              <Switch
                id="content-dedup"
                checked={contentBasedDeduplication}
                onCheckedChange={setContentBasedDeduplication}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="kms-key">KMS Master Key ID</Label>
            <Input
              id="kms-key"
              value={kmsMasterKeyId}
              onChange={(e) => setKmsMasterKeyId(e.target.value)}
              placeholder="alias/my-key"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              AWS KMS key ID for server-side encryption (optional)
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Key"
                value={tagKey}
                onChange={(e) => setTagKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
              <Input
                placeholder="Value"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
              <Button type="button" size="sm" onClick={addTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {Object.keys(tags).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(tags).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="gap-1">
                    {key}: {value}
                    <button
                      type="button"
                      onClick={() => removeTag(key)}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Topic'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// Create Subscription Sheet
// ============================================================================

interface CreateSubscriptionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  topicArn: string
  activeEndpoint: string | null
}

function CreateSubscriptionSheet({ open, onOpenChange, onSuccess, topicArn, activeEndpoint }: CreateSubscriptionSheetProps) {
  const [protocol, setProtocol] = useState<string>('sqs')
  const [endpoint, setEndpoint] = useState('')
  const [filterPolicy, setFilterPolicy] = useState('')
  const [rawMessageDelivery, setRawMessageDelivery] = useState(false)
  const [redrivePolicy, setRedrivePolicy] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!endpoint.trim()) {
      toast.error('Endpoint is required')
      return
    }

    try {
      setCreating(true)
      const request: SNSSubscribeRequest = {
        protocol,
        endpoint: endpoint.trim(),
        rawMessageDelivery,
      }

      if (filterPolicy.trim()) {
        try {
          request.filterPolicy = JSON.parse(filterPolicy)
        } catch {
          toast.error('Invalid filter policy JSON')
          setCreating(false)
          return
        }
      }

      if (redrivePolicy.trim()) {
        try {
          request.redrivePolicy = JSON.parse(redrivePolicy)
        } catch {
          toast.error('Invalid redrive policy JSON')
          setCreating(false)
          return
        }
      }

      await createSNSSubscription(topicArn, request, activeEndpoint)
      toast.success('Subscription created')

      // Reset form
      setEndpoint('')
      setFilterPolicy('')
      setRawMessageDelivery(false)
      setRedrivePolicy('')

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(`Failed to create subscription: ${error}`)
    } finally {
      setCreating(false)
    }
  }

  const protocolOptions = [
    { value: 'http', label: 'HTTP', icon: LinkIcon },
    { value: 'https', label: 'HTTPS', icon: LinkIcon },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'email-json', label: 'Email (JSON)', icon: Mail },
    { value: 'sms', label: 'SMS', icon: Smartphone },
    { value: 'sqs', label: 'SQS', icon: UserCheck },
    { value: 'lambda', label: 'Lambda', icon: FileJson },
    { value: 'application', label: 'Application', icon: Smartphone },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Subscription
          </SheetTitle>
          <SheetDescription>Subscribe an endpoint to receive messages from this topic</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="protocol">Protocol *</Label>
            <Select value={protocol} onValueChange={setProtocol}>
              <SelectTrigger id="protocol">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {protocolOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endpoint">Endpoint *</Label>
            <Input
              id="endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={
                protocol === 'sqs'
                  ? 'arn:aws:sqs:...'
                  : protocol === 'lambda'
                  ? 'arn:aws:lambda:...'
                  : protocol === 'http' || protocol === 'https'
                  ? 'https://example.com/endpoint'
                  : protocol === 'email'
                  ? 'user@example.com'
                  : 'endpoint'
              }
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {protocol === 'sqs' && 'SQS queue ARN'}
              {protocol === 'lambda' && 'Lambda function ARN'}
              {(protocol === 'http' || protocol === 'https') && 'URL endpoint'}
              {protocol === 'email' && 'Email address'}
              {protocol === 'application' && 'Platform application endpoint ARN'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="raw-delivery">Raw Message Delivery</Label>
              <p className="text-xs text-muted-foreground">
                Deliver the raw message body without JSON wrapping
              </p>
            </div>
            <Switch id="raw-delivery" checked={rawMessageDelivery} onCheckedChange={setRawMessageDelivery} />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="filter-policy">Filter Policy (JSON)</Label>
            <Textarea
              id="filter-policy"
              value={filterPolicy}
              onChange={(e) => setFilterPolicy(e.target.value)}
              placeholder='{\n  "store": ["example"]\n}'
              className="font-mono text-sm"
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Filter messages based on message attributes. Leave empty to receive all messages.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="redrive-policy">Redrive Policy (JSON)</Label>
            <Textarea
              id="redrive-policy"
              value={redrivePolicy}
              onChange={(e) => setRedrivePolicy(e.target.value)}
              placeholder='{\n  "deadLetterTargetArn": "arn:aws:sqs:..."\n}'
              className="font-mono text-sm"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              DLQ ARN for failed message deliveries (optional)
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Subscribe'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// Edit Subscription Sheet
// ============================================================================

interface EditSubscriptionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  subscription: SNSSubscription | null
  activeEndpoint: string | null
}

function EditSubscriptionSheet({ open, onOpenChange, onSuccess, subscription, activeEndpoint }: EditSubscriptionSheetProps) {
  const [filterPolicy, setFilterPolicy] = useState('')
  const [rawMessageDelivery, setRawMessageDelivery] = useState(false)
  const [redrivePolicy, setRedrivePolicy] = useState('')
  const [deliveryPolicy, setDeliveryPolicy] = useState('')
  const [subscriptionRoleArn, setSubscriptionRoleArn] = useState('')
  const [saving, setSaving] = useState(false)

  // Pre-fill form when subscription changes
  useEffect(() => {
    if (subscription) {
      setFilterPolicy(subscription.filterPolicy ? JSON.stringify(subscription.filterPolicy, null, 2) : '')
      setRawMessageDelivery(subscription.rawMessageDelivery || false)
      setRedrivePolicy(subscription.redrivePolicy ? JSON.stringify(subscription.redrivePolicy, null, 2) : '')
      setDeliveryPolicy(subscription.deliveryPolicy ? JSON.stringify(subscription.deliveryPolicy, null, 2) : '')
      setSubscriptionRoleArn(subscription.subscriptionRoleArn || '')
    } else {
      // Reset form
      setFilterPolicy('')
      setRawMessageDelivery(false)
      setRedrivePolicy('')
      setDeliveryPolicy('')
      setSubscriptionRoleArn('')
    }
  }, [subscription])

  const handleSave = async () => {
    if (!subscription) {
      return
    }

    try {
      setSaving(true)
      const attributes: Record<string, unknown> = {
        rawMessageDelivery,
      }

      if (filterPolicy.trim()) {
        try {
          attributes.filterPolicy = JSON.parse(filterPolicy)
        } catch {
          toast.error('Invalid filter policy JSON')
          setSaving(false)
          return
        }
      } else {
        attributes.filterPolicy = null
      }

      if (redrivePolicy.trim()) {
        try {
          attributes.redrivePolicy = JSON.parse(redrivePolicy)
        } catch {
          toast.error('Invalid redrive policy JSON')
          setSaving(false)
          return
        }
      } else {
        attributes.redrivePolicy = null
      }

      if (deliveryPolicy.trim()) {
        try {
          attributes.deliveryPolicy = JSON.parse(deliveryPolicy)
        } catch {
          toast.error('Invalid delivery policy JSON')
          setSaving(false)
          return
        }
      }

      if (subscriptionRoleArn.trim()) {
        attributes.subscriptionRoleArn = subscriptionRoleArn.trim()
      }

      await updateSNSSubscriptionAttributes(subscription.subscriptionArn, attributes, activeEndpoint)
      toast.success('Subscription updated')

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(`Failed to update subscription: ${error}`)
    } finally {
      setSaving(false)
    }
  }

  if (!subscription) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Subscription
          </SheetTitle>
          <SheetDescription>
            Modify subscription attributes for <span className="font-mono">{subscription.endpoint}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label>Protocol</Label>
            <div className="flex items-center gap-2">
              <ProtocolBadge protocol={subscription.protocol} />
              <span className="text-sm text-muted-foreground">(cannot be changed)</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Endpoint</Label>
            <code className="text-xs bg-muted px-2 py-1 rounded block">{subscription.endpoint}</code>
            <p className="text-xs text-muted-foreground">(cannot be changed)</p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="raw-delivery-edit">Raw Message Delivery</Label>
              <p className="text-xs text-muted-foreground">
                Deliver the raw message body without JSON wrapping
              </p>
            </div>
            <Switch id="raw-delivery-edit" checked={rawMessageDelivery} onCheckedChange={setRawMessageDelivery} />
          </div>

          {subscription.protocol === 'sqs' && (
            <div className="space-y-2">
              <Label htmlFor="subscription-role-arn">Subscription Role ARN</Label>
              <Input
                id="subscription-role-arn"
                value={subscriptionRoleArn}
                onChange={(e) => setSubscriptionRoleArn(e.target.value)}
                placeholder="arn:aws:iam::..."
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                IAM role ARN for SQS subscriptions (optional)
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="filter-policy-edit">Filter Policy (JSON)</Label>
            <Textarea
              id="filter-policy-edit"
              value={filterPolicy}
              onChange={(e) => setFilterPolicy(e.target.value)}
              placeholder='{\n  "store": ["example"]\n}'
              className="font-mono text-sm"
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Filter messages based on message attributes. Leave empty to receive all messages.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="redrive-policy-edit">Redrive Policy (JSON)</Label>
            <Textarea
              id="redrive-policy-edit"
              value={redrivePolicy}
              onChange={(e) => setRedrivePolicy(e.target.value)}
              placeholder='{\n  "deadLetterTargetArn": "arn:aws:sqs:..."\n}'
              className="font-mono text-sm"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              DLQ ARN for failed message deliveries (optional)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delivery-policy-edit">Delivery Policy (JSON)</Label>
            <Textarea
              id="delivery-policy-edit"
              value={deliveryPolicy}
              onChange={(e) => setDeliveryPolicy(e.target.value)}
              placeholder='{\n  "healthyRetryPolicy": {...}\n}'
              className="font-mono text-sm"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Retry policy for message delivery (optional)
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// Publish Message Sheet
// ============================================================================

interface PublishMessageSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  topicArn: string
  isFifo: boolean
  activeEndpoint: string | null
}

function PublishMessageSheet({ open, onOpenChange, onSuccess, topicArn, isFifo, activeEndpoint }: PublishMessageSheetProps) {
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [messageGroupId, setMessageGroupId] = useState('')
  const [messageDeduplicationId, setMessageDeduplicationId] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [batchEntries, setBatchEntries] = useState('')

  const handlePublish = async () => {
    if (!message.trim()) {
      toast.error('Message is required')
      return
    }

    try {
      setPublishing(true)
      const request: SNSPublishRequest = {
        message: message,
        subject: subject || undefined,
      }

      if (isFifo) {
        if (!messageGroupId) {
          toast.error('Message Group ID is required for FIFO topics')
          setPublishing(false)
          return
        }
        request.messageGroupId = messageGroupId
        request.messageDeduplicationId = messageDeduplicationId || undefined
      }

      await publishSNSMessage(topicArn, request, activeEndpoint)
      toast.success('Message published')

      // Reset form
      setMessage('')
      setSubject('')
      setMessageGroupId('')
      setMessageDeduplicationId('')

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(`Failed to publish message: ${error}`)
    } finally {
      setPublishing(false)
    }
  }

  const handleBatchPublish = async () => {
    try {
      setPublishing(true)
      let entries: Array<{ id: string; message: string; subject?: string }> = []

      try {
        entries = JSON.parse(batchEntries)
        if (!Array.isArray(entries) || entries.length === 0 || entries.length > 10) {
          throw new Error('Entries must be an array with 1-10 items')
        }
        for (const entry of entries) {
          if (!entry.id || !entry.message) {
            throw new Error('Each entry must have id and message')
          }
        }
      } catch {
        toast.error('Invalid batch entries JSON')
        setPublishing(false)
        return
      }

      const request: SNSBatchPublishRequest = { entries }

      const response = await publishSNSMessagesBatch(topicArn, request, activeEndpoint)

      if (response.successful.length > 0) {
        toast.success(`Published ${response.successful.length} message(s)`)
      }
      if (response.failed.length > 0) {
        toast.error(`${response.failed.length} message(s) failed`)
      }

      setBatchEntries('')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(`Failed to publish messages: ${error}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Publish Message
          </SheetTitle>
          <SheetDescription>Send a message to all subscribers of this topic</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="single" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">
              Single Message
            </TabsTrigger>
            <TabsTrigger value="batch">
              Batch (max 10)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder='{"message": "Hello World"}'
                className="font-mono text-sm"
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Message subject"
              />
              <p className="text-xs text-muted-foreground">
                Subject for email notifications (optional)
              </p>
            </div>

            {isFifo && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="msg-group-id">Message Group ID *</Label>
                  <Input
                    id="msg-group-id"
                    value={messageGroupId}
                    onChange={(e) => setMessageGroupId(e.target.value)}
                    placeholder="group-1"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Messages in the same group are delivered in order
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="msg-dedup-id">Message Deduplication ID</Label>
                  <Input
                    id="msg-dedup-id"
                    value={messageDeduplicationId}
                    onChange={(e) => setMessageDeduplicationId(e.target.value)}
                    placeholder="auto-generated if empty"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Override deduplication (optional)
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handlePublish} disabled={publishing}>
                {publishing ? 'Publishing...' : 'Publish'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="batch" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="batch-entries">Batch Entries (JSON) *</Label>
              <Textarea
                id="batch-entries"
                value={batchEntries}
                onChange={(e) => setBatchEntries(e.target.value)}
                placeholder='[
  {
    "id": "msg1",
    "message": "Hello",
    "subject": "Greeting"
  },
  {
    "id": "msg2",
    "message": "World"
  }
]'
                className="font-mono text-sm"
                rows={12}
              />
              <p className="text-xs text-muted-foreground">
                Max 10 entries. Each entry must have <code>id</code> and <code>message</code>.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleBatchPublish} disabled={publishing}>
                {publishing ? 'Publishing...' : 'Publish Batch'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// Topics List View
// ============================================================================

interface TopicsListViewProps {
  topics: SNSTopic[]
  loading: boolean
  onRefresh: () => void
  onSelectTopic: (topic: string) => void
  onCreateTopic: () => void
}

function TopicsListView({ topics, loading, onRefresh, onSelectTopic, onCreateTopic }: TopicsListViewProps) {
  const [search, setSearch] = useState('')

  const filteredTopics = topics.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.arn.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-bold">SNS Topics</h2>
        <Badge variant="secondary">{topics.length}</Badge>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search topics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <ImportButton service="sns" onComplete={onRefresh} />
          {filteredTopics.length > 0 && <ExportDropdown service="sns" resourceType="topics" data={filteredTopics as unknown as Record<string, unknown>[]} />}
          <Button onClick={onCreateTopic}>
            <Plus className="h-4 w-4 mr-2" />
            Create topic
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onRefresh}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredTopics.length === 0 ? (
        <>
          <EmptyState
            icon={Bell}
            title={search ? 'No topics found' : 'No SNS topics'}
            description={
              search
                ? 'Try adjusting your search terms'
                : 'Create your first SNS topic to get started with pub/sub messaging'
            }
          />
          {!search && (
            <div className="flex justify-center gap-2 mt-4">
              <ImportButton service="sns" onComplete={onRefresh} />
              <Button onClick={onCreateTopic}>
                <Plus className="h-4 w-4 mr-2" />
                Create topic
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subscriptions</TableHead>
                <TableHead>ARN</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTopics.map((topic) => (
                <TableRow
                  key={topic.arn}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectTopic(topic.arn)}
                >
                  <TableCell className="font-medium">
                    <div>
                      <div className="font-mono">{topic.name}</div>
                      {topic.displayName && (
                        <div className="text-sm text-muted-foreground">{topic.displayName}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TopicTypeBadge type={topic.type} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{topic.subscriptionCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {topic.arn.slice(0, 50)}...
                    </code>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectTopic(topic.arn)
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Topic Detail View
// ============================================================================

interface TopicDetailViewProps {
  topicArn: string
  onBack: () => void
  onRefresh: () => void
  activeEndpoint: string | null
}

function TopicDetailView({ topicArn, onBack, onRefresh, activeEndpoint }: TopicDetailViewProps) {
  const [topicDetail, setTopicDetail] = useState<SNSTopicDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<SNSSubscription[]>([])
  const [loadingSubs, setLoadingSubs] = useState(true)
  const [protocolFilter, setProtocolFilter] = useState<string>('all')
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set())
  const [createSubSheetOpen, setCreateSubSheetOpen] = useState(false)
  const [editSubSheetOpen, setEditSubSheetOpen] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState<SNSSubscription | null>(null)
  const [publishSheetOpen, setPublishSheetOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [subscriptionsRefreshKey, setSubscriptionsRefreshKey] = useState(0)

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setLoading(true)
        const detail = await fetchSNSTopicDetail(topicArn, activeEndpoint)
        setTopicDetail(detail)
      } catch (error) {
        toast.error(`Failed to fetch topic details: ${error}`)
      } finally {
        setLoading(false)
      }
    }

    fetchDetail()
  }, [topicArn, activeEndpoint])

  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        setLoadingSubs(true)
        const filters = protocolFilter !== 'all' ? { protocol: protocolFilter } : undefined
        const response = await fetchSNSSubscriptions(topicArn, filters, activeEndpoint)
        setSubscriptions(response.subscriptions)
      } catch (error) {
        toast.error(`Failed to fetch subscriptions: ${error}`)
      } finally {
        setLoadingSubs(false)
      }
    }

    fetchSubscriptions()
  }, [topicArn, protocolFilter, activeEndpoint, subscriptionsRefreshKey])

  const handleDeleteTopic = async () => {
    try {
      await deleteSNSTopic(topicArn, activeEndpoint)
      toast.success('Topic deleted')
      onBack()
    } catch (error) {
      toast.error(`Failed to delete topic: ${error}`)
    }
  }

  const handleDeleteSubscriptions = async () => {
    try {
      await Promise.all(
        Array.from(selectedSubs).map((subArn) =>
          deleteSNSSubscription(subArn, activeEndpoint)
        )
      )
      toast.success(`Deleted ${selectedSubs.size} subscription(s)`)
      setSelectedSubs(new Set())
      // Trigger both parent refresh and local subscriptions refresh
      onRefresh()
      setSubscriptionsRefreshKey(prev => prev + 1)
    } catch (error) {
      toast.error(`Failed to delete subscriptions: ${error}`)
    }
  }

  // Local refresh handler that refreshes both parent state and subscriptions
  const handleLocalRefresh = () => {
    onRefresh()
    setSubscriptionsRefreshKey(prev => prev + 1)
  }

  const filteredSubscriptions = subscriptions

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    )
  }

  if (!topicDetail) {
    return (
      <>
        <EmptyState
          icon={Bell}
          title="Topic not found"
          description="The requested topic could not be loaded"
        />
        <div className="flex justify-center mt-4">
          <Button variant="outline" onClick={onBack}>
            Go Back
          </Button>
        </div>
      </>
    )
  }

  const isFifo = topicDetail.type === 'FIFO'

  return (
    <div className="space-y-4">
      <Breadcrumb
        segments={[
          createHomeSegment(),
          { label: 'SNS', href: '/resources?sns' },
          { label: topicDetail.name, href: '' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            {topicDetail.name}
            <TopicTypeBadge type={topicDetail.type} />
          </h2>
          <p className="text-muted-foreground">
            {topicDetail.subscriptionCount} subscription
            {topicDetail.subscriptionCount !== 1 ? 's' : ''}
            {topicDetail.displayName && ` · ${topicDetail.displayName}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPublishSheetOpen(true)}>
            <Send className="h-4 w-4 mr-2" />
            Publish
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="subscriptions">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="subscriptions">
            Subscriptions ({topicDetail.subscriptionCount})
          </TabsTrigger>
          <TabsTrigger value="publish">Publish</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="tags">
            Tags <TagCountBadge count={Object.keys(topicDetail.tags || {}).length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by protocol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Protocols</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                  <SelectItem value="sqs">SQS</SelectItem>
                  <SelectItem value="lambda">Lambda</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="application">Application</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {selectedSubs.size > 0 && (
                <Button variant="destructive" size="sm" onClick={handleDeleteSubscriptions}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedSubs.size})
                </Button>
              )}
              <Button size="sm" onClick={() => setCreateSubSheetOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Subscribe
              </Button>
            </div>
          </div>

          {loadingSubs ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredSubscriptions.length === 0 ? (
            <>
              <EmptyState
                icon={UserCheck}
                title={
                  protocolFilter === 'all'
                    ? 'No subscriptions'
                    : `No ${protocolFilter} subscriptions`
                }
                description="Subscribe endpoints to this topic to receive messages"
              />
              <div className="flex justify-center mt-4">
                <Button onClick={() => setCreateSubSheetOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Subscription
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        checked={
                          selectedSubs.size === filteredSubscriptions.length &&
                          filteredSubscriptions.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSubs(
                              new Set(filteredSubscriptions.map((s) => s.subscriptionArn))
                            )
                          } else {
                            setSelectedSubs(new Set())
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Filter Policy</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubscriptions.map((sub) => (
                    <TableRow key={sub.subscriptionArn}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedSubs.has(sub.subscriptionArn)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedSubs)
                            if (e.target.checked) {
                              newSelected.add(sub.subscriptionArn)
                            } else {
                              newSelected.delete(sub.subscriptionArn)
                            }
                            setSelectedSubs(newSelected)
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <ProtocolBadge protocol={sub.protocol} />
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded max-w-[200px] block truncate">
                          {sub.endpoint}
                        </code>
                      </TableCell>
                      <TableCell>
                        <SubscriptionStatusBadge status={sub.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sub.owner}</TableCell>
                      <TableCell>
                        {sub.filterPolicy ? (
                          <Badge variant="secondary" className="gap-1">
                            <Filter className="h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingSubscription(sub)
                            setEditSubSheetOpen(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="publish" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Publish Message</CardTitle>
              <CardDescription>
                Send a message to all subscribers of this topic
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Megaphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  Publish messages to this topic to deliver them to all subscribers
                </p>
                <Button onClick={() => setPublishSheetOpen(true)}>
                  <Send className="h-4 w-4 mr-2" />
                  Open Publish Panel
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuration" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Topic Attributes</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonViewer
                data={{
                  name: topicDetail.name,
                  arn: topicDetail.arn,
                  type: topicDetail.type,
                  displayName: topicDetail.displayName,
                  owner: topicDetail.owner,
                  subscriptionCount: topicDetail.subscriptionCount,
                  kmsMasterKeyId: topicDetail.kmsMasterKeyId,
                  signatureVersion: topicDetail.signatureVersion,
                  tracingConfig: topicDetail.tracingConfig,
                  contentBasedDeduplication: topicDetail.contentBasedDeduplication,
                }}
              />
            </CardContent>
          </Card>

          {topicDetail.deliveryPolicy && (
            <Card>
              <CardHeader>
                <CardTitle>Delivery Policy</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer data={topicDetail.deliveryPolicy} />
              </CardContent>
            </Card>
          )}

          {topicDetail.policy && (
            <Card>
              <CardHeader>
                <CardTitle>Access Policy</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer data={topicDetail.policy} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          <TagsSection
            tags={topicDetail.tags}
            onSave={async (newTags) => {
              await updateResourceTags('sns', 'topics', topicArn, newTags, activeEndpoint)
            }}
          />
        </TabsContent>
      </Tabs>

      <CreateSubscriptionSheet
        open={createSubSheetOpen}
        onOpenChange={setCreateSubSheetOpen}
        onSuccess={handleLocalRefresh}
        topicArn={topicArn}
        activeEndpoint={activeEndpoint}
      />

      <EditSubscriptionSheet
        open={editSubSheetOpen}
        onOpenChange={setEditSubSheetOpen}
        onSuccess={handleLocalRefresh}
        subscription={editingSubscription}
        activeEndpoint={activeEndpoint}
      />

      <PublishMessageSheet
        open={publishSheetOpen}
        onOpenChange={setPublishSheetOpen}
        onSuccess={handleLocalRefresh}
        topicArn={topicArn}
        isFifo={isFifo}
        activeEndpoint={activeEndpoint}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Topic</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete topic <strong>{topicDetail.name}</strong>? This will also
              delete all {topicDetail.subscriptionCount} subscription(s). This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTopic}>
              Delete Topic
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Main SNS Browser Component
// ============================================================================

export function SNSBrowser() {
  const { activeEndpoint } = useEndpoint()
  const [searchParams, setSearchParams] = useSearchParams()
  const topicsFetcher = useCallback(
    () => fetchSNSTopics(activeEndpoint),
    [activeEndpoint]
  )
  const { data: topicsData, loading: topicsLoading, refresh: refreshTopics } = useFetch(
    topicsFetcher,
    10000
  )

  const selectedTopic = searchParams.get('topic')

  const setSelectedTopic = (topic: string | null) => {
    if (topic === null) {
      setSearchParams({})
    } else {
      setSearchParams({ topic })
    }
  }

  const [createTopicSheetOpen, setCreateTopicSheetOpen] = useState(false)

  const handleRefresh = () => {
    refreshTopics()
  }

  if (selectedTopic) {
    return (
      <TopicDetailView
        topicArn={selectedTopic}
        onBack={() => setSelectedTopic(null)}
        onRefresh={handleRefresh}
        activeEndpoint={activeEndpoint}
      />
    )
  }

  return (
    <>
      <TopicsListView
        topics={topicsData?.topics || []}
        loading={topicsLoading}
        onRefresh={handleRefresh}
        onSelectTopic={setSelectedTopic}
        onCreateTopic={() => setCreateTopicSheetOpen(true)}
      />
      <CreateTopicSheet
        open={createTopicSheetOpen}
        onOpenChange={setCreateTopicSheetOpen}
        onSuccess={handleRefresh}
      />
    </>
  )
}
