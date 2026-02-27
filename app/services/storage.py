"""
MinIO object storage service for file uploads (logos, etc.).
"""

import io
import json
import logging
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[Minio] = None


def get_minio_client() -> Minio:
    """Get or create a MinIO client singleton."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,  # internal Docker network
        )
    return _client


def ensure_bucket() -> None:
    """Create the assets bucket if it doesn't exist, with public read on logos/."""
    settings = get_settings()
    client = get_minio_client()
    bucket = settings.minio_bucket

    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("Created MinIO bucket: %s", bucket)

        # Set public read policy on logos/ prefix
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": "*"},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket}/logos/*"],
                }
            ],
        }
        client.set_bucket_policy(bucket, json.dumps(policy))
        logger.info("Set public read policy on %s/logos/*", bucket)
    else:
        logger.info("MinIO bucket already exists: %s", bucket)


def upload_logo(shop_id: str, file_data: bytes, content_type: str, ext: str) -> str:
    """Upload a shop logo to MinIO and return the public URL path."""
    settings = get_settings()
    client = get_minio_client()

    object_name = f"logos/{shop_id}.{ext}"

    client.put_object(
        settings.minio_bucket,
        object_name,
        io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )

    return f"{settings.minio_public_url}/{object_name}"


def delete_logo(shop_id: str) -> None:
    """Delete all logo variants for a shop."""
    settings = get_settings()
    client = get_minio_client()

    for ext in ("png", "jpg", "jpeg", "webp", "svg"):
        object_name = f"logos/{shop_id}.{ext}"
        try:
            client.remove_object(settings.minio_bucket, object_name)
        except S3Error:
            pass
