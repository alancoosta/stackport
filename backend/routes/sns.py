"""SNS service-specific routes."""

import json
import logging
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from backend.aws_client import get_client
from backend.routes.common import get_endpoint_url

router = APIRouter()
logger = logging.getLogger(__name__)


def _extract_topic_name(topic_arn: str) -> str:
    """Extract topic name from SNS topic ARN."""
    return topic_arn.rsplit(":", 1)[-1]


def _parse_delivery_policy(policy_json: str | None) -> dict[str, Any] | None:
    """Parse DeliveryPolicy JSON string into structured dict."""
    if not policy_json:
        return None
    try:
        return json.loads(policy_json)
    except (json.JSONDecodeError, TypeError):
        return None


def _parse_effective_delivery_policy(policy_json: str | None) -> dict[str, Any] | None:
    """Parse EffectiveDeliveryPolicy JSON string into structured dict."""
    if not policy_json:
        return None
    try:
        return json.loads(policy_json)
    except (json.JSONDecodeError, TypeError):
        return None


def _parse_redrive_policy(policy_json: str | None) -> dict[str, Any] | None:
    """Parse redrive policy JSON string for subscriptions."""
    if not policy_json:
        return None
    try:
        return json.loads(policy_json)
    except (json.JSONDecodeError, TypeError):
        return None


def _parse_filter_policy(policy_json: str | None) -> dict[str, Any] | None:
    """Parse FilterPolicy JSON string for subscriptions."""
    if not policy_json:
        return None
    try:
        return json.loads(policy_json)
    except (json.JSONDecodeError, TypeError):
        return None


def _parse_access_policy(policy_json: str | None) -> dict[str, Any] | None:
    """Parse access policy JSON string."""
    if not policy_json:
        return None
    try:
        return json.loads(policy_json)
    except (json.JSONDecodeError, TypeError):
        return None


# ============================================================================
# Topic Endpoints
# ============================================================================


@router.get("/topics")
def list_topics(endpoint_url: str | None = Depends(get_endpoint_url)) -> dict[str, Any]:
    """List all SNS topics with enriched attributes.

    Returns topic name, ARN, subscription count, type, and tags.
    """
    try:
        client = get_client("sns", endpoint_url)
        response = client.list_topics()
        topics_data = response.get("Topics", [])

        topics = []
        for topic_arn in topics_data:
            try:
                arn = topic_arn.get("TopicArn", "")
                if not arn:
                    continue

                # Get topic attributes
                attrs_response = client.get_topic_attributes(TopicArn=arn)
                attrs = attrs_response.get("Attributes", {})

                # Get subscription count
                sub_response = client.list_subscriptions_by_topic(TopicArn=arn)
                subscription_count = len(sub_response.get("Subscriptions", []))

                # Get tags
                try:
                    tags_response = client.list_tags_for_resource(ResourceArn=arn)
                    tags = {tag["Key"]: tag["Value"] for tag in tags_response.get("Tags", [])}
                except Exception:
                    tags = {}

                topic_name = _extract_topic_name(arn)
                is_fifo = topic_name.endswith(".fifo")

                topics.append(
                    {
                        "name": topic_name,
                        "arn": arn,
                        "subscriptionCount": subscription_count,
                        "type": "FIFO" if is_fifo else "Standard",
                        "displayName": attrs.get("DisplayName"),
                        "owner": attrs.get("Owner", ""),
                        "tags": tags,
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to fetch details for topic {topic_arn}: {e}")
                continue

        return {"topics": topics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topics")
def create_topic(body: dict[str, Any]) -> dict[str, Any]:
    """Create a new SNS topic.

    Request body:
    {
      "name": "...",
      "displayName": "...",
      "fifo": false,
      "contentBasedDeduplication": false,
      "tags": { "key": "value" },
      "deliveryPolicy": { ... },
      "kmsMasterKeyId": "..."
    }
    """
    try:
        client = get_client("sns")

        name = body.get("name", "")
        if not name:
            raise HTTPException(status_code=400, detail="name is required")

        # Validate and process FIFO suffix
        is_fifo = body.get("fifo", False)
        if is_fifo and not name.endswith(".fifo"):
            name = f"{name}.fifo"
        elif not is_fifo and name.endswith(".fifo"):
            # Name already has .fifo, treat as FIFO
            is_fifo = True

        # Build tags list for boto3
        tags_list = []
        tags = body.get("tags")
        if tags:
            tags_list = [{"Key": k, "Value": v} for k, v in tags.items()]

        # Build create kwargs
        create_kwargs: dict[str, Any] = {"Name": name}
        if tags_list:
            create_kwargs["Tags"] = tags_list

        # Create the topic
        response = client.create_topic(**create_kwargs)
        topic_arn = response.get("TopicArn")

        if not topic_arn:
            raise HTTPException(status_code=500, detail="Failed to create topic")

        # Set additional attributes
        attributes: dict[str, str] = {}

        if body.get("displayName"):
            attributes["DisplayName"] = body["displayName"]

        if body.get("contentBasedDeduplication") and is_fifo:
            attributes["ContentBasedDeduplication"] = "true"

        if body.get("kmsMasterKeyId"):
            attributes["KmsMasterKeyId"] = body["kmsMasterKeyId"]

        if body.get("deliveryPolicy"):
            attributes["DeliveryPolicy"] = json.dumps(body["deliveryPolicy"])

        if attributes:
            client.set_topic_attributes(TopicArn=topic_arn, Attributes=attributes)

        return {
            "arn": topic_arn,
            "name": name,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# IMPORTANT: Specific topic sub-routes must be defined BEFORE the generic /topics/{topic_arn:path}
# route, because FastAPI's :path converter is greedy and will match the entire path.


@router.put("/topics/{topic_arn:path}/attributes")
def update_topic_attributes(topic_arn: str, body: dict[str, Any]) -> dict[str, Any]:
    """Update topic attributes.

    Request body:
    {
      "displayName": "...",
      "deliveryPolicy": { ... },
      "policy": { ... },
      "contentBasedDeduplication": true,
      "kmsMasterKeyId": "..."
    }
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        # Build attributes dict
        attributes: dict[str, str] = {}

        if "displayName" in body:
            attributes["DisplayName"] = body["displayName"]

        if "contentBasedDeduplication" in body:
            attributes["ContentBasedDeduplication"] = (
                "true" if body["contentBasedDeduplication"] else "false"
            )

        if "kmsMasterKeyId" in body:
            attributes["KmsMasterKeyId"] = body["kmsMasterKeyId"]

        if "deliveryPolicy" in body:
            attributes["DeliveryPolicy"] = json.dumps(body["deliveryPolicy"])

        if "policy" in body:
            attributes["Policy"] = json.dumps(body["policy"])

        if "signatureVersion" in body:
            attributes["SignatureVersion"] = body["signatureVersion"]

        if "tracingConfig" in body:
            attributes["TracingConfig"] = body["tracingConfig"]

        # Feedback attributes
        feedback_attrs = [
            ("applicationSuccessFeedbackRoleArn", "ApplicationSuccessFeedbackRoleArn"),
            ("applicationSuccessFeedbackSampleRate", "ApplicationSuccessFeedbackSampleRate"),
            ("applicationFailureFeedbackRoleArn", "ApplicationFailureFeedbackRoleArn"),
            ("httpSuccessFeedbackRoleArn", "HttpSuccessFeedbackRoleArn"),
            ("httpSuccessFeedbackSampleRate", "HttpSuccessFeedbackSampleRate"),
            ("httpFailureFeedbackRoleArn", "HttpFailureFeedbackRoleArn"),
            ("lambdaSuccessFeedbackRoleArn", "LambdaSuccessFeedbackRoleArn"),
            ("lambdaSuccessFeedbackSampleRate", "LambdaSuccessFeedbackSampleRate"),
            ("lambdaFailureFeedbackRoleArn", "LambdaFailureFeedbackRoleArn"),
            ("sqsSuccessFeedbackRoleArn", "SqsSuccessFeedbackRoleArn"),
            ("sqsSuccessFeedbackSampleRate", "SqsSuccessFeedbackSampleRate"),
            ("sqsFailureFeedbackRoleArn", "SqsFailureFeedbackRoleArn"),
        ]

        for key, attr_name in feedback_attrs:
            if key in body:
                attributes[attr_name] = body[key]

        if not attributes:
            raise HTTPException(status_code=400, detail="No attributes provided")

        client.set_topic_attributes(TopicArn=decoded_arn, Attributes=attributes)

        return {
            "success": True,
            "message": f"Topic {decoded_arn} attributes updated successfully",
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/topics/{topic_arn:path}/tags")
def update_topic_tags(topic_arn: str, body: dict[str, Any]) -> dict[str, Any]:
    """Update topic tags.

    Request body:
    {
      "tags": { "key": "value" }
    }
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        tags = body.get("tags")
        if tags is None:
            raise HTTPException(status_code=400, detail="tags is required")

        # Convert tags dict to list format
        tags_list = [{"Key": k, "Value": v} for k, v in tags.items()]

        client.tag_resource(ResourceArn=decoded_arn, Tags=tags_list)

        return {
            "success": True,
            "message": f"Topic {decoded_arn} tags updated successfully",
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Subscription Endpoints (must be before generic /topics/{topic_arn:path})
# ============================================================================


@router.get("/topics/{topic_arn:path}/subscriptions")
def list_subscriptions(
    topic_arn: str,
    protocol: str | None = None,
    endpoint_url: str | None = Depends(get_endpoint_url),
) -> dict[str, Any]:
    """List subscriptions for a topic with optional filtering.

    Query params:
    - protocol: Filter by protocol (http, https, email, sqs, lambda, application)
    """
    try:
        client = get_client("sns", endpoint_url)

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        response = client.list_subscriptions_by_topic(TopicArn=decoded_arn)
        subscriptions_data = response.get("Subscriptions", [])

        subscriptions = []
        for sub in subscriptions_data:
            try:
                sub_arn = sub.get("SubscriptionArn", "")
                if sub_arn == "PendingConfirmation":
                    # This is a pending subscription
                    sub_arn = f"pending:{sub.get('Owner', '')}:{sub.get('Endpoint', '')}"

                # Filter by protocol if specified
                sub_protocol = sub.get("Protocol", "")
                if protocol and sub_protocol.lower() != protocol.lower():
                    continue

                # Get subscription attributes
                attrs = {}
                try:
                    if sub_arn and not sub_arn.startswith("pending:"):
                        attrs_response = client.get_subscription_attributes(
                            SubscriptionArn=sub_arn
                        )
                        attrs = attrs_response.get("Attributes", {})
                except Exception:
                    pass

                # Parse subscription attributes
                filter_policy = _parse_filter_policy(attrs.get("FilterPolicy"))
                redrive_policy = _parse_redrive_policy(attrs.get("RedrivePolicy"))

                # Determine status
                status = "confirmed"
                if sub_arn.startswith("pending:"):
                    status = "pending"

                subscriptions.append(
                    {
                        "subscriptionArn": sub_arn,
                        "topicArn": sub.get("TopicArn", ""),
                        "protocol": sub_protocol.lower(),
                        "endpoint": sub.get("Endpoint", ""),
                        "owner": sub.get("Owner", ""),
                        "status": status,
                        "filterPolicy": filter_policy,
                        "rawMessageDelivery": attrs.get("RawMessageDelivery") == "true",
                        "redrivePolicy": redrive_policy,
                        "subscriptionRoleArn": attrs.get("SubscriptionRoleArn"),
                        "deliveryPolicy": _parse_delivery_policy(attrs.get("DeliveryPolicy")),
                        "effectiveDeliveryPolicy": _parse_effective_delivery_policy(
                            attrs.get("EffectiveDeliveryPolicy")
                        ),
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to process subscription: {e}")
                continue

        return {"subscriptions": subscriptions}
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topics/{topic_arn:path}/subscriptions")
def create_subscription(
    topic_arn: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Subscribe to an SNS topic.

    Request body:
    {
      "protocol": "sqs" | "http" | "https" | "lambda" | "email" | "application",
      "endpoint": "...",
      "filterPolicy": { ... },
      "rawMessageDelivery": false,
      "redrivePolicy": { "deadLetterTargetArn": "..." },
      "subscriptionRoleArn": "...",
      "deliveryPolicy": { ... }
    }
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        protocol = body.get("protocol", "")
        if not protocol:
            raise HTTPException(status_code=400, detail="protocol is required")

        endpoint = body.get("endpoint", "")
        if not endpoint:
            raise HTTPException(status_code=400, detail="endpoint is required")

        # Build subscribe kwargs
        subscribe_kwargs: dict[str, Any] = {
            "TopicArn": decoded_arn,
            "Protocol": protocol,
            "Endpoint": endpoint,
        }

        # Return subscription ARN immediately for synchronous protocols
        subscribe_kwargs["ReturnSubscriptionArn"] = True

        response = client.subscribe(**subscribe_kwargs)
        subscription_arn = response.get("SubscriptionArn")

        if not subscription_arn:
            # For async protocols (email, https), might not get ARN immediately
            return {
                "subscriptionArn": "PendingConfirmation",
                "message": "Subscription created. Please confirm the subscription.",
            }

        # Set additional attributes
        attributes: dict[str, str] = {}

        if body.get("rawMessageDelivery"):
            attributes["RawMessageDelivery"] = "true"

        if body.get("subscriptionRoleArn"):
            attributes["SubscriptionRoleArn"] = body["subscriptionRoleArn"]

        if body.get("filterPolicy"):
            attributes["FilterPolicy"] = json.dumps(body["filterPolicy"])

        if body.get("redrivePolicy"):
            attributes["RedrivePolicy"] = json.dumps(body["redrivePolicy"])

        if body.get("deliveryPolicy"):
            attributes["DeliveryPolicy"] = json.dumps(body["deliveryPolicy"])

        if attributes and subscription_arn != "PendingConfirmation":
            # Set each attribute individually (boto3 requires AttributeName/AttributeValue)
            for attr_name, attr_value in attributes.items():
                client.set_subscription_attributes(
                    SubscriptionArn=subscription_arn,
                    AttributeName=attr_name,
                    AttributeValue=attr_value,
                )

        return {
            "subscriptionArn": subscription_arn,
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Publishing Endpoints (must be before generic /topics/{topic_arn:path})
# ============================================================================


@router.post("/topics/{topic_arn:path}/publish")
def publish_message(topic_arn: str, body: dict[str, Any]) -> dict[str, Any]:
    """Publish a message to an SNS topic.

    Request body:
    {
      "message": "...",
      "subject": "...",
      "messageStructure": "json" | "string",
      "messageAttributes": { "key": { "stringValue": "val", "dataType": "String" } },
      "messageDeduplicationId": "...",  // FIFO topics
      "messageGroupId": "..."  // FIFO topics
    }
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        message = body.get("message", "")
        if not message:
            raise HTTPException(status_code=400, detail="message is required")

        # Build publish kwargs
        publish_kwargs: dict[str, Any] = {
            "TopicArn": decoded_arn,
            "Message": message,
        }

        # Optional parameters
        if "subject" in body:
            publish_kwargs["Subject"] = body["subject"]

        if "messageStructure" in body:
            publish_kwargs["MessageStructure"] = body["messageStructure"]

        if "messageDeduplicationId" in body:
            publish_kwargs["MessageDeduplicationId"] = body["messageDeduplicationId"]

        if "messageGroupId" in body:
            publish_kwargs["MessageGroupId"] = body["messageGroupId"]

        # Convert message attributes from UI format to boto3 format
        if "messageAttributes" in body:
            attrs = {}
            for key, value in body["messageAttributes"].items():
                attr_entry: dict[str, str] = {"DataType": value.get("dataType", "String")}

                if "stringValue" in value:
                    attr_entry["StringValue"] = value["stringValue"]
                elif "binaryValue" in value:
                    attr_entry["BinaryValue"] = value["binaryValue"]

                attrs[key] = attr_entry
            publish_kwargs["MessageAttributes"] = attrs

        response = client.publish(**publish_kwargs)

        return {
            "messageId": response.get("MessageId"),
            "sequenceNumber": response.get("SequenceNumber"),
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topics/{topic_arn:path}/publish/batch")
def publish_messages_batch(topic_arn: str, body: dict[str, Any]) -> dict[str, Any]:
    """Publish multiple messages to an SNS topic.

    Request body:
    {
      "entries": [
        {
          "id": "msg1",
          "message": "...",
          "subject": "...",
          "messageStructure": "json",
          "messageAttributes": { ... },
          "messageDeduplicationId": "...",
          "messageGroupId": "..."
        },
        ...
      ]
    }

    Max 10 entries per batch.
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        entries = body.get("entries", [])
        if not entries:
            raise HTTPException(status_code=400, detail="entries is required")

        if len(entries) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 entries per batch")

        # SNS doesn't have true batch publish, so we publish sequentially
        successful = []
        failed = []

        for entry in entries:
            entry_id = entry.get("id", "")
            message = entry.get("message", "")

            if not message:
                failed.append(
                    {
                        "id": entry_id,
                        "code": "InvalidMessage",
                        "message": "message is required",
                    }
                )
                continue

            try:
                publish_kwargs: dict[str, Any] = {
                    "TopicArn": decoded_arn,
                    "Message": message,
                }

                if "subject" in entry:
                    publish_kwargs["Subject"] = entry["subject"]

                if "messageStructure" in entry:
                    publish_kwargs["MessageStructure"] = entry["messageStructure"]

                if "messageDeduplicationId" in entry:
                    publish_kwargs["MessageDeduplicationId"] = entry[
                        "messageDeduplicationId"
                    ]

                if "messageGroupId" in entry:
                    publish_kwargs["MessageGroupId"] = entry["messageGroupId"]

                if "messageAttributes" in entry:
                    attrs = {}
                    for key, value in entry["messageAttributes"].items():
                        attr_entry: dict[str, str] = {
                            "DataType": value.get("dataType", "String")
                        }

                        if "stringValue" in value:
                            attr_entry["StringValue"] = value["stringValue"]
                        elif "binaryValue" in value:
                            attr_entry["BinaryValue"] = value["binaryValue"]

                        attrs[key] = attr_entry
                    publish_kwargs["MessageAttributes"] = attrs

                response = client.publish(**publish_kwargs)

                successful.append(
                    {
                        "id": entry_id,
                        "messageId": response.get("MessageId"),
                        "sequenceNumber": response.get("SequenceNumber"),
                    }
                )
            except Exception as e:
                failed.append(
                    {"id": entry_id, "code": "PublishError", "message": str(e)}
                )

        return {"successful": successful, "failed": failed}
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Generic Topic CRUD (must be AFTER all specific /topics/{topic_arn:path}/* routes)
# ============================================================================


@router.get("/topics/{topic_arn:path}")
def get_topic_detail(
    topic_arn: str, endpoint_url: str | None = Depends(get_endpoint_url)
) -> dict[str, Any]:
    """Get detailed attributes for a specific topic."""
    try:
        client = get_client("sns", endpoint_url)

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        # Get topic attributes
        attrs_response = client.get_topic_attributes(TopicArn=decoded_arn)
        attrs = attrs_response.get("Attributes", {})

        # Get tags
        try:
            tags_response = client.list_tags_for_resource(ResourceArn=decoded_arn)
            tags = {tag["Key"]: tag["Value"] for tag in tags_response.get("Tags", [])}
        except Exception:
            tags = {}

        topic_name = _extract_topic_name(decoded_arn)
        is_fifo = topic_name.endswith(".fifo")

        # Get subscription count
        sub_response = client.list_subscriptions_by_topic(TopicArn=decoded_arn)
        subscription_count = len(sub_response.get("Subscriptions", []))

        return {
            "name": topic_name,
            "arn": decoded_arn,
            "subscriptionCount": subscription_count,
            "type": "FIFO" if is_fifo else "Standard",
            "displayName": attrs.get("DisplayName"),
            "owner": attrs.get("Owner", ""),
            "deliveryPolicy": _parse_delivery_policy(attrs.get("DeliveryPolicy")),
            "effectiveDeliveryPolicy": _parse_effective_delivery_policy(
                attrs.get("EffectiveDeliveryPolicy")
            ),
            "policy": _parse_access_policy(attrs.get("Policy")),
            "applicationSuccessFeedbackRoleArn": attrs.get(
                "ApplicationSuccessFeedbackRoleArn"
            ),
            "applicationSuccessFeedbackSampleRate": attrs.get(
                "ApplicationSuccessFeedbackSampleRate"
            ),
            "applicationFailureFeedbackRoleArn": attrs.get(
                "ApplicationFailureFeedbackRoleArn"
            ),
            "httpSuccessFeedbackRoleArn": attrs.get("HttpSuccessFeedbackRoleArn"),
            "httpSuccessFeedbackSampleRate": attrs.get(
                "HttpSuccessFeedbackSampleRate"
            ),
            "httpFailureFeedbackRoleArn": attrs.get("HttpFailureFeedbackRoleArn"),
            "lambdaSuccessFeedbackRoleArn": attrs.get("LambdaSuccessFeedbackRoleArn"),
            "lambdaSuccessFeedbackSampleRate": attrs.get(
                "LambdaSuccessFeedbackSampleRate"
            ),
            "lambdaFailureFeedbackRoleArn": attrs.get("LambdaFailureFeedbackRoleArn"),
            "sqsSuccessFeedbackRoleArn": attrs.get("SqsSuccessFeedbackRoleArn"),
            "sqsSuccessFeedbackSampleRate": attrs.get(
                "SqsSuccessFeedbackSampleRate"
            ),
            "sqsFailureFeedbackRoleArn": attrs.get("SqsFailureFeedbackRoleArn"),
            "kmsMasterKeyId": attrs.get("KmsMasterKeyId"),
            "signatureVersion": attrs.get("SignatureVersion"),
            "tracingConfig": attrs.get("TracingConfig"),
            "contentBasedDeduplication": attrs.get("ContentBasedDeduplication") == "true",
            "tags": tags,
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/topics/{topic_arn:path}")
def delete_topic(topic_arn: str) -> Response:
    """Delete an SNS topic.

    Permanently deletes the topic and all its subscriptions.
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(topic_arn)

        client.delete_topic(TopicArn=decoded_arn)

        return Response(status_code=204)
    except client.exceptions.NotFoundException:
        raise HTTPException(status_code=404, detail=f"Topic {topic_arn} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Other Subscription Endpoints
# ============================================================================


@router.get("/subscriptions/{subscription_arn:path}")
def get_subscription_attributes(
    subscription_arn: str, endpoint_url: str | None = Depends(get_endpoint_url)
) -> dict[str, Any]:
    """Get detailed attributes for a specific subscription."""
    try:
        client = get_client("sns", endpoint_url)

        # Decode ARN if URL-encoded
        decoded_arn = unquote(subscription_arn)

        attrs_response = client.get_subscription_attributes(
            SubscriptionArn=decoded_arn
        )
        attrs = attrs_response.get("Attributes", {})

        return {
            "subscriptionArn": decoded_arn,
            "topicArn": attrs.get("TopicArn", ""),
            "protocol": attrs.get("Protocol", "").lower(),
            "endpoint": attrs.get("Endpoint", ""),
            "owner": attrs.get("Owner", ""),
            "filterPolicy": _parse_filter_policy(attrs.get("FilterPolicy")),
            "rawMessageDelivery": attrs.get("RawMessageDelivery") == "true",
            "redrivePolicy": _parse_redrive_policy(attrs.get("RedrivePolicy")),
            "subscriptionRoleArn": attrs.get("SubscriptionRoleArn"),
            "deliveryPolicy": _parse_delivery_policy(attrs.get("DeliveryPolicy")),
            "effectiveDeliveryPolicy": _parse_effective_delivery_policy(
                attrs.get("EffectiveDeliveryPolicy")
            ),
            "confirmationWasAuthenticated": (
                attrs.get("ConfirmationWasAuthenticated") == "true"
            ),
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(
            status_code=404, detail=f"Subscription {subscription_arn} not found"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/subscriptions/{subscription_arn:path}")
def delete_subscription(subscription_arn: str) -> Response:
    """Delete/unsubscribe from an SNS topic."""
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(subscription_arn)

        client.unsubscribe(SubscriptionArn=decoded_arn)

        return Response(status_code=204)
    except client.exceptions.NotFoundException:
        raise HTTPException(
            status_code=404, detail=f"Subscription {subscription_arn} not found"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/{subscription_arn:path}/attributes")
def update_subscription_attributes(
    subscription_arn: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Update subscription attributes.

    Request body:
    {
      "filterPolicy": { ... },
      "rawMessageDelivery": true,
      "redrivePolicy": { "deadLetterTargetArn": "..." },
      "subscriptionRoleArn": "...",
      "deliveryPolicy": { ... }
    }
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(subscription_arn)

        # Build attributes dict
        attributes: dict[str, str] = {}

        if "rawMessageDelivery" in body:
            attributes["RawMessageDelivery"] = (
                "true" if body["rawMessageDelivery"] else "false"
            )

        if "subscriptionRoleArn" in body:
            attributes["SubscriptionRoleArn"] = body["subscriptionRoleArn"]

        if "filterPolicy" in body:
            if body["filterPolicy"] is None:
                # Remove filter policy
                attributes["FilterPolicy"] = "{}"
            else:
                attributes["FilterPolicy"] = json.dumps(body["filterPolicy"])

        if "redrivePolicy" in body:
            if body["redrivePolicy"] is None:
                # Remove redrive policy - AWS doesn't support removing, so set empty
                attributes["RedrivePolicy"] = "{}"
            else:
                attributes["RedrivePolicy"] = json.dumps(body["redrivePolicy"])

        if "deliveryPolicy" in body:
            attributes["DeliveryPolicy"] = json.dumps(body["deliveryPolicy"])

        if not attributes:
            raise HTTPException(status_code=400, detail="No attributes provided")

        # Set each attribute individually (boto3 requires AttributeName/AttributeValue)
        for attr_name, attr_value in attributes.items():
            client.set_subscription_attributes(
                SubscriptionArn=decoded_arn,
                AttributeName=attr_name,
                AttributeValue=attr_value,
            )

        return {
            "success": True,
            "message": f"Subscription {decoded_arn} attributes updated successfully",
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(
            status_code=404, detail=f"Subscription {subscription_arn} not found"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/subscriptions/{subscription_arn:path}/confirm")
def confirm_subscription(
    subscription_arn: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Confirm a subscription (for URL/email protocols).

    Request body:
    {
      "token": "...",
      "authenticateOnUnsubscribe": "false"
    }
    """
    try:
        client = get_client("sns")

        token = body.get("token", "")
        if not token:
            raise HTTPException(status_code=400, detail="token is required")

        authenticate_on_unsubscribe = body.get("authenticateOnUnsubscribe", "false")

        response = client.confirm_subscription(
            TopicArn=subscription_arn,
            Token=token,
            AuthenticateOnUnsubscribe=authenticate_on_unsubscribe,
        )

        return {
            "subscriptionArn": response.get("SubscriptionArn"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Platform Application Endpoints
# ============================================================================


@router.get("/platform-applications")
def list_platform_applications(
    endpoint_url: str | None = Depends(get_endpoint_url)
) -> dict[str, Any]:
    """List all SNS platform applications."""
    try:
        client = get_client("sns", endpoint_url)
        response = client.list_platform_applications()

        applications = []
        for app in response.get("PlatformApplications", []):
            arn = app.get("PlatformApplicationArn", "")
            try:
                # Get application attributes
                attrs_response = client.get_platform_application_attributes(
                    PlatformApplicationArn=arn
                )
                attrs = attrs_response.get("Attributes", {})

                applications.append(
                    {
                        "applicationArn": arn,
                        "platform": attrs.get("Platform", ""),
                        "attributes": {
                            "AppleCertificate": attrs.get("AppleCertificate"),
                            "ApplePrivateKey": attrs.get("ApplePrivateKey"),
                            "Enabled": attrs.get("Enabled"),
                            "EventEndpointCreated": attrs.get("EventEndpointCreated"),
                            "EventEndpointDeleted": attrs.get("EventEndpointDeleted"),
                            "EventEndpointUpdated": attrs.get("EventEndpointUpdated"),
                            "FeedbackRoleArn": attrs.get("FeedbackRoleArn"),
                            "PlatformCredential": attrs.get("PlatformCredential"),
                            "PlatformPrincipal": attrs.get("PlatformPrincipal"),
                        },
                    }
                )
            except Exception:
                # Add minimal info if attribute fetch fails
                applications.append(
                    {
                        "applicationArn": arn,
                        "platform": "",
                        "attributes": {},
                    }
                )

        return {"applications": applications}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/platform-applications")
def create_platform_application(body: dict[str, Any]) -> dict[str, Any]:
    """Create a new SNS platform application.

    Request body:
    {
      "name": "...",
      "platform": "APNS" | "APNS_SANDBOX" | "GCM" | "ADM" | "BAIDU" | "WNS" | "MPNS",
      "attributes": {
        "PlatformCredential": "...",
        "PlatformPrincipal": "...",
        "AppleCertificate": "...",
        "ApplePrivateKey": "...",
        "Enabled": "true",
        "FeedbackRoleArn": "..."
      }
    }
    """
    try:
        client = get_client("sns")

        name = body.get("name", "")
        if not name:
            raise HTTPException(status_code=400, detail="name is required")

        platform = body.get("platform", "")
        if not platform:
            raise HTTPException(status_code=400, detail="platform is required")

        attributes = body.get("attributes", {})

        response = client.create_platform_application(
            Name=name, Platform=platform, Attributes=attributes
        )

        return {
            "applicationArn": response.get("PlatformApplicationArn"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/platform-applications/{application_arn:path}")
def delete_platform_application(application_arn: str) -> Response:
    """Delete an SNS platform application."""
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(application_arn)

        client.delete_platform_application(PlatformApplicationArn=decoded_arn)

        return Response(status_code=204)
    except client.exceptions.NotFoundException:
        raise HTTPException(
            status_code=404, detail=f"Platform application {application_arn} not found"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/platform-applications/{application_arn:path}/endpoints")
def list_platform_endpoints(
    application_arn: str, endpoint_url: str | None = Depends(get_endpoint_url)
) -> dict[str, Any]:
    """List endpoints for a platform application."""
    try:
        client = get_client("sns", endpoint_url)

        # Decode ARN if URL-encoded
        decoded_arn = unquote(application_arn)

        response = client.list_endpoints_by_platform_application(
            PlatformApplicationArn=decoded_arn
        )

        endpoints = []
        for endpoint in response.get("Endpoints", []):
            arn = endpoint.get("EndpointArn", "")
            try:
                # Get endpoint attributes
                attrs_response = client.get_endpoint_attributes(EndpointArn=arn)
                attrs = attrs_response.get("Attributes", {})

                endpoints.append(
                    {
                        "endpointArn": arn,
                        "attributes": {
                            "Token": attrs.get("Token"),
                            "Enabled": attrs.get("Enabled"),
                            "CustomUserData": attrs.get("CustomUserData"),
                        },
                    }
                )
            except Exception:
                # Add minimal info if attribute fetch fails
                endpoints.append(
                    {
                        "endpointArn": arn,
                        "attributes": {},
                    }
                )

        return {"endpoints": endpoints}
    except client.exceptions.NotFoundException:
        raise HTTPException(
            status_code=404, detail=f"Platform application {application_arn} not found"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/platform-applications/{application_arn:path}/endpoints")
def create_platform_endpoint(
    application_arn: str, body: dict[str, Any]
) -> dict[str, Any]:
    """Create a new platform endpoint.

    Request body:
    {
      "token": "...",
      "customUserData": "...",
      "data": { ... }
    }
    """
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(application_arn)

        token = body.get("token", "")
        if not token:
            raise HTTPException(status_code=400, detail="token is required")

        # Create endpoint kwargs
        endpoint_kwargs: dict[str, Any] = {
            "PlatformApplicationArn": decoded_arn,
            "Token": token,
        }

        if "customUserData" in body:
            endpoint_kwargs["CustomUserData"] = body["customUserData"]

        if "data" in body:
            endpoint_kwargs["UserData"] = json.dumps(body["data"])

        response = client.create_platform_endpoint(**endpoint_kwargs)

        return {
            "endpointArn": response.get("EndpointArn"),
        }
    except client.exceptions.NotFoundException:
        raise HTTPException(
            status_code=404, detail=f"Platform application {application_arn} not found"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/platform-endpoints/{endpoint_arn:path}")
def delete_platform_endpoint(endpoint_arn: str) -> Response:
    """Delete a platform endpoint."""
    try:
        client = get_client("sns")

        # Decode ARN if URL-encoded
        decoded_arn = unquote(endpoint_arn)

        client.delete_endpoint(EndpointArn=decoded_arn)

        return Response(status_code=204)
    except client.exceptions.NotFoundException:
        raise HTTPException(
            status_code=404, detail=f"Platform endpoint {endpoint_arn} not found"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
