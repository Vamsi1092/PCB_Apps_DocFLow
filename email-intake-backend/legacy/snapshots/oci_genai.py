import logging
import oci
import oci_config

log = logging.getLogger("OCI_GenAI")

_inference_client = None


def get_inference_client():
    global _inference_client

    if _inference_client is None:
        config = oci_config.get_config()

        if config is None:
            raise RuntimeError("OCI config could not be loaded.")

        _inference_client = oci.generative_ai_inference.GenerativeAiInferenceClient(
            config,
            service_endpoint=oci_config.GENAI_INFERENCE_ENDPOINT,
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY
        )

    return _inference_client


def get_chat_response(
    prompt: str,
    system_prompt: str = "You are an Accounts Payable AI Assistant.",
    temperature: float = 0,
    max_tokens: int = 4000
) -> str:
    client = get_inference_client()

    messages = [
        oci.generative_ai_inference.models.Message(
            role="SYSTEM",
            content=[
                oci.generative_ai_inference.models.TextContent(
                    text=system_prompt
                )
            ]
        ),
        oci.generative_ai_inference.models.Message(
            role="USER",
            content=[
                oci.generative_ai_inference.models.TextContent(
                    text=prompt
                )
            ]
        )
    ]

    chat_request = oci.generative_ai_inference.models.GenericChatRequest(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        top_p=0.9
    )

    serving_mode = oci.generative_ai_inference.models.OnDemandServingMode(
        model_id=oci_config.CHAT_MODEL_ID
    )

    chat_details = oci.generative_ai_inference.models.ChatDetails(
        compartment_id=oci_config.COMPARTMENT_ID,
        serving_mode=serving_mode,
        chat_request=chat_request
    )

    response = client.chat(chat_details)

    choice = response.data.chat_response.choices[0]

    if hasattr(choice, "message") and choice.message and choice.message.content:
        return choice.message.content[0].text.strip()

    if hasattr(choice, "text"):
        return choice.text.strip()

    raise RuntimeError("OCI Gen AI returned empty response.")