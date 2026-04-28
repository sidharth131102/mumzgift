import os
import tempfile
from pathlib import Path

from fastapi import HTTPException

from schemas import Language, TranscribeResponse

USE_GROQ = os.getenv("USE_GROQ", "false").lower() == "true"

_local_model = None


def _get_local_model():
    global _local_model
    if _local_model is None:
        import whisper
        _local_model = whisper.load_model("base")
    return _local_model


async def transcribe_audio(audio_bytes: bytes, filename: str) -> TranscribeResponse:
    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        if USE_GROQ:
            return await _transcribe_groq(tmp_path)
        else:
            return _transcribe_local(tmp_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _transcribe_local(path: str) -> TranscribeResponse:
    model = _get_local_model()
    result = model.transcribe(path)
    detected = result.get("language", "en")
    lang = Language(detected) if detected in ("en", "ar") else Language.EN
    return TranscribeResponse(
        transcript=result["text"].strip(),
        language=lang,
    )


async def _transcribe_groq(path: str) -> TranscribeResponse:
    from groq import Groq
    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    with open(path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=f,
            model="whisper-large-v3",
            response_format="verbose_json",
        )
    detected = getattr(result, "language", "en")
    lang = Language(detected) if detected in ("en", "ar") else Language.EN
    return TranscribeResponse(
        transcript=result.text.strip(),
        language=lang,
    )
