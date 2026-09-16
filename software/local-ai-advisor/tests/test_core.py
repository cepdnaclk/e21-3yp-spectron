from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from spectron_local_ai.confidence import ConfidenceEstimator, ConfidenceFeatures
from spectron_local_ai.config import DEFAULT_KNOWLEDGE_DIR, Settings
from spectron_local_ai.inference import GenerationResult, LocalHTTPModel
from spectron_local_ai.knowledge import KnowledgeIndex
from spectron_local_ai.prompting import build_messages, extract_json_object
from spectron_local_ai.safety import enforce_grounding
from spectron_local_ai.service import AdvisorRuntime, RecommendationRequest, app


class KnowledgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = KnowledgeIndex.from_directory(DEFAULT_KNOWLEDGE_DIR)

    def test_all_five_crops_are_loaded(self) -> None:
        crops = {document.crop for document in self.index.documents}
        self.assertEqual(crops, {"Chilli", "Maize", "Paddy / Rice", "Potato", "Tomato"})
        self.assertEqual(len(self.index.documents), 30)

    def test_tomato_symptom_retrieval(self) -> None:
        matches = self.index.retrieve("tomato", "Fruiting", "dark spots with concentric rings", 3)
        self.assertTrue(matches)
        self.assertEqual(matches[0].document.topic, "Early blight")

    def test_unknown_crop_is_not_answered_from_another_crop(self) -> None:
        self.assertEqual(self.index.retrieve("banana", "fruiting", "dark spots", 5), [])

    def test_unrelated_maize_symptom_does_not_select_whorl_or_water_advice(self) -> None:
        matches = self.index.retrieve(
            "maize", "Vegetative", "New leaves are pale yellow in one patch", 5
        )
        topics = {match.document.topic for match in matches}
        self.assertNotIn("Whorl damage triage", topics)
        self.assertNotIn("Water-stress confirmation", topics)

    def test_maize_whorl_symptoms_select_whorl_triage(self) -> None:
        matches = self.index.retrieve(
            "maize", "Vegetative", "Holes and fresh waste are visible inside the whorl", 3
        )
        self.assertTrue(matches)
        self.assertEqual(matches[0].document.topic, "Whorl damage triage")


class PromptAndSafetyTests(unittest.TestCase):
    def test_prompt_contains_supplied_evidence_and_reference(self) -> None:
        index = KnowledgeIndex.from_directory(DEFAULT_KNOWLEDGE_DIR)
        matches = index.retrieve("maize", "Vegetative", "rolled leaves", 2)
        messages = build_messages(
            {
                "crop": "Maize",
                "growth_stage": "Vegetative",
                "farmer_observation": "Rolled leaves at midday",
                "sensor_summary": "moisture unavailable",
                "weather_summary": "hot and dry",
            },
            matches,
        )
        self.assertIn("Rolled leaves at midday", messages[1]["content"])
        self.assertIn("approved_crop_references", messages[1]["content"])

    def test_json_extraction_accepts_fenced_output(self) -> None:
        self.assertEqual(extract_json_object('```json\n{"status":"GOOD"}\n```')["status"], "GOOD")

    def test_unsupported_treatment_is_removed(self) -> None:
        payload, removed = enforce_grounding(
            {"do_now": ["Spray Example 2 g/litre today."], "avoid_for_now": []},
            [{"content": "Inspect affected leaves and seek confirmation."}],
        )
        self.assertEqual(payload["do_now"], [])
        self.assertTrue(removed)
        self.assertEqual(payload["confidence_label"], "LOW")


class ConfidenceTests(unittest.TestCase):
    def test_missing_calibrator_is_explicit_and_never_high(self) -> None:
        estimator = ConfidenceEstimator(Path(__file__).parent / "missing-confidence.joblib")
        result = estimator.estimate(
            ConfidenceFeatures(0.9, 1, 1, 1, 1, 1, 1, 0.8)
        )
        self.assertFalse(result.calibrated)
        self.assertLess(result.score, 0.70)
        self.assertNotEqual(result.label, "HIGH")


class AdvisorRuntimeTests(unittest.TestCase):
    def test_health_endpoint_reports_model_readiness(self) -> None:
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertTrue(payload["knowledge_dir_available"])

    def test_complete_request_uses_context_and_returns_honest_confidence(self) -> None:
        settings = Settings(
            model_backend="http",
            local_model_url="http://127.0.0.1:1/v1",
            local_model_name="test-local-model",
            hf_model_id="unused",
            lora_adapter_path="",
            knowledge_dir=DEFAULT_KNOWLEDGE_DIR,
            confidence_model_path=Path(__file__).parent / "missing-confidence.joblib",
            top_k=4,
            host="127.0.0.1",
            port=8091,
            api_key="",
        )
        runtime = AdvisorRuntime(settings)

        class FakeEngine:
            def generate(self, messages: list[dict[str, str]]) -> GenerationResult:
                self.messages = messages
                return GenerationResult(
                    text='{"status":"NEEDS_ATTENTION","headline":"Check ringed leaf spots",'
                    '"what_may_be_happening":"Early blight-like symptoms need confirmation.",'
                    '"do_now":["Photograph both sides of three affected leaves."],'
                    '"check_next":["Check whether spots spread upward."],'
                    '"why_this_advice":["Ringed spots match the retrieved crop note."],'
                    '"avoid_for_now":["Do not treat before confirmation."],'
                    '"recheck_after":"Tomorrow morning","get_help_if":["Spots spread rapidly."],'
                    '"tell_us_next":"Are rings visible?","safety_note":"Confirm before treatment.",'
                    '"evidence":["Dark concentric spots were reported."],'
                    '"confidence_label":"MEDIUM","sources":["Sri Lanka Department of Agriculture"]}',
                    mean_token_probability=0.72,
                )

        runtime.engine = FakeEngine()
        result = runtime.recommend(
            RecommendationRequest(
                crop="Tomato",
                growth_stage="Fruiting",
                farmer_observation="Dark spots with concentric rings are spreading on older leaves.",
                sensor_summary="Humidity averaged 88 percent over 24 hours.",
                weather_summary="Recent rain and high humidity.",
            )
        )
        self.assertEqual(result["provider"], "local")
        self.assertEqual(result["confidence"], "MEDIUM")
        self.assertFalse(result["confidence_details"]["calibrated"])
        self.assertTrue(result["retrieved_context"])
        self.assertEqual(result["retrieved_context"][0]["topic"], "Early blight")

    def test_unmatched_maize_observation_uses_specific_safe_fallback(self) -> None:
        settings = Settings(
            model_backend="http",
            local_model_url="http://127.0.0.1:1/v1",
            local_model_name="test-local-model",
            hf_model_id="unused",
            lora_adapter_path="",
            knowledge_dir=DEFAULT_KNOWLEDGE_DIR,
            confidence_model_path=Path(__file__).parent / "missing-confidence.joblib",
            top_k=5,
            host="127.0.0.1",
            port=8091,
            api_key="",
        )
        runtime = AdvisorRuntime(settings)

        class GenericEngine:
            def generate(self, messages: list[dict[str, str]]) -> GenerationResult:
                return GenerationResult(
                    text='{"status":"NEED_MORE_INFO","headline":"Check maize problems",'
                    '"what_may_be_happening":"Unknown.","do_now":["Record context."],'
                    '"check_next":[],"why_this_advice":[],"avoid_for_now":[],'
                    '"recheck_after":"","get_help_if":[],"tell_us_next":"Do leaves recover in the evening?",'
                    '"safety_note":"","evidence":[],"confidence_label":"MEDIUM","sources":[]}',
                    mean_token_probability=0.72,
                )

        runtime.engine = GenericEngine()
        observation = "New maize leaves are pale yellow while old leaves remain green in one patch."
        result = runtime.recommend(
            RecommendationRequest(
                crop="Maize",
                growth_stage="Vegetative",
                farmer_observation=observation,
                sensor_summary="Soil moisture 31 percent and stable; humidity 78 percent.",
                weather_summary="No rain today; warm and humid.",
            )
        )

        topics = {item["topic"] for item in result["retrieved_context"]}
        self.assertNotIn("Whorl damage triage", topics)
        self.assertNotIn("Water-stress confirmation", topics)
        self.assertEqual(result["headline"], "Check the reported Maize leaf change today.")
        self.assertIn(observation, result["evidence"][0])
        self.assertGreaterEqual(len(result["do_now"]), 2)
        self.assertNotIn("recover in the evening", result["tell_us_next"].lower())
        self.assertEqual(result["confidence"], "LOW")

    def test_answered_whorl_questions_are_not_repeated(self) -> None:
        settings = Settings(
            model_backend="http",
            local_model_url="http://127.0.0.1:1/v1",
            local_model_name="test-local-model",
            hf_model_id="unused",
            lora_adapter_path="",
            knowledge_dir=DEFAULT_KNOWLEDGE_DIR,
            confidence_model_path=Path(__file__).parent / "missing-confidence.joblib",
            top_k=5,
            host="127.0.0.1",
            port=8091,
            api_key="",
        )
        runtime = AdvisorRuntime(settings)

        class RepeatingEngine:
            def generate(self, messages: list[dict[str, str]]) -> GenerationResult:
                return GenerationResult(
                    text='{"status":"NEED_MORE_INFO","headline":"Inspect maize whorls",'
                    '"what_may_be_happening":"Whorl feeding needs confirmation.",'
                    '"do_now":["Apply fertilizer now."],'
                    '"check_next":["Ask what proportion of plants is affected."],"why_this_advice":[],'
                    '"avoid_for_now":[],"recheck_after":"","get_help_if":[],'
                    '"tell_us_next":"Are larvae or fresh waste visible inside the whorl?",'
                    '"safety_note":"","evidence":[],"confidence_label":"MEDIUM","sources":[]}',
                    mean_token_probability=0.72,
                )

        runtime.engine = RepeatingEngine()
        result = runtime.recommend(
            RecommendationRequest(
                crop="Maize",
                growth_stage="Vegetative",
                farmer_observation=(
                    "Holes and fresh waste are visible inside newly opening leaf whorls "
                    "on about one in five plants."
                ),
                sensor_summary="Soil moisture 31 percent and stable.",
                weather_summary="No rain today.",
            )
        )

        self.assertEqual(result["retrieved_context"][0]["topic"], "Whorl damage triage")
        self.assertEqual(result["tell_us_next"], "")
        self.assertEqual(result["status"], "NEEDS_ATTENTION")
        self.assertGreaterEqual(len(result["do_now"]), 2)
        self.assertFalse(any("fertilizer" in action.lower() for action in result["do_now"]))
        self.assertFalse(any("proportion" in item.lower() for item in result["check_next"]))


class LocalModelCompatibilityTests(unittest.TestCase):
    @patch("spectron_local_ai.inference.httpx.post")
    def test_retries_without_optional_openai_features(self, post: Mock) -> None:
        unsupported = Mock(status_code=400)
        successful = Mock(status_code=200)
        successful.raise_for_status.return_value = None
        successful.json.return_value = {
            "choices": [{"message": {"content": '{"status":"GOOD"}'}}]
        }
        post.side_effect = [unsupported, successful]
        settings = Settings(
            model_backend="http",
            local_model_url="http://127.0.0.1:8081/v1",
            local_model_name="test-model",
            hf_model_id="unused",
            lora_adapter_path="",
            knowledge_dir=DEFAULT_KNOWLEDGE_DIR,
            confidence_model_path=Path("unused.joblib"),
            top_k=4,
            host="127.0.0.1",
            port=8091,
            api_key="",
        )

        result = LocalHTTPModel(settings).generate([{"role": "user", "content": "test"}])

        self.assertEqual(result.text, '{"status":"GOOD"}')
        self.assertEqual(post.call_count, 2)
        retry_payload = post.call_args_list[1].kwargs["json"]
        self.assertNotIn("response_format", retry_payload)
        self.assertNotIn("logprobs", retry_payload)


if __name__ == "__main__":
    unittest.main()
