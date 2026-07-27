import os
import oci
from dotenv import load_dotenv

load_dotenv()

COMPARTMENT_ID = os.getenv("COMPARTMENT_ID")
REGION = os.getenv("OCI_REGION", "us-ashburn-1")

GENAI_INFERENCE_ENDPOINT = (
    f"https://inference.generativeai.{REGION}.oci.oraclecloud.com"
)

# OCI Gen AI models
CHAT_MODEL_ID = "google.gemini-2.5-pro"
FALLBACK_MODEL_ID = "xai.grok-4.20-reasoning"


def get_config():
    try:
        return oci.config.from_file()
    except Exception as e:
        print(f"Error loading OCI config: {e}")
        return None