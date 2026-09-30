"""Original post composition is checked before yt-dlp filters media."""
import copy
import importlib.util
import json
import unittest
from unittest.mock import patch

from post_sources import pinterest_evidence, twitter_evidence, wrap_post_extractor


SOURCE_ID = "1575560063510810624"
MEDIA_ID = "1575559336759263233"
PIN_ID = "1084663891475263837"


def tweet_video(identity=MEDIA_ID, **changes):
    item = {"id_str": identity, "type": "video", "video_info": {"duration_millis": 12_000,
            "variants": [{"url": f"https://video.twimg.com/ext_tw_video/{identity}/pu/vid/avc1/640x360/example.mp4", "bitrate": 832000}]}}
    item.update(changes)
    return item


def status(media=None, **changes):
    result = {"id_str": SOURCE_ID, "text": "Example", "user": {"protected": False},
              "extended_entities": {"media": media if media is not None else [tweet_video()]}}
    result.update(changes)
    return result


def unified_card(media=None):
    return {"name": "unified_card", "binding_values": {"unified_card": {"type": "STRING", "string_value": json.dumps({
        "media_entities": media if media is not None else {f"13_{MEDIA_ID}": tweet_video()}})}}}


def pin_video():
    return {"id": "5191020440994233995", "video_list": {"V_720P": {
        "url": "https://v1.pinimg.com/videos/example.mp4", "width": 640, "height": 360, "duration": 12_000}}}


def pin(**changes):
    value = {"id": PIN_ID, "domain": "Uploaded by user", "privacy": "public", "access": [],
             "is_hidden": False, "videos": pin_video()}
    value.update(changes)
    return value


def story_pin(blocks=None):
    return pin(videos=None, story_pin_data={"pages": [{"id": "3681186128", "blocks": blocks if blocks is not None else [
        {"type": "story_pin_video_block", "video": pin_video()},
        {"type": "story_pin_paragraph_block", "text": "A caption"}]}]})


class TwitterEvidenceTests(unittest.TestCase):
    def test_native_post_binds_requested_post_and_original_video_identity(self):
        proof = twitter_evidence(status(), SOURCE_ID, 5)
        self.assertEqual(proof["sourceId"], SOURCE_ID)
        self.assertEqual(proof["items"], [{"id": MEDIA_ID, "type": "video"}])
        self.assertEqual(proof["originalComposition"], "complete")

    def test_unified_card_preserves_original_media(self):
        proof = twitter_evidence(status([], card=unified_card()), SOURCE_ID, 5)
        self.assertEqual(proof["items"], [{"id": MEDIA_ID, "type": "video"}])

    def test_all_video_post_keeps_every_item_in_order(self):
        items = [tweet_video(str(int(MEDIA_ID) + index)) for index in range(5)]
        proof = twitter_evidence(status(items), SOURCE_ID, 5)
        self.assertEqual([item["id"] for item in proof["items"]], [item["id_str"] for item in items])

    def test_rejects_original_photos_even_when_extractor_would_drop_them(self):
        for fixture in (status([{"id_str": "1", "type": "photo"}, tweet_video()]),
                        status([], card=unified_card({"photo": {"id_str": "1", "type": "photo"}, "video": tweet_video()})),
                        status(photos=[{"url": "https://pbs.twimg.com/photo"}])):
            with self.subTest(fixture=fixture), self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
                twitter_evidence(fixture, SOURCE_ID, 5)

    def test_rejects_unbound_incomplete_duplicate_oversized_or_delegated_posts(self):
        cases = [status(id_str="other"), status([]), status([tweet_video(), tweet_video()]),
                 status([tweet_video(str(index)) for index in range(6)]),
                 status(quoted_status={"extended_entities": {"media": [tweet_video()]}}),
                 status(retweeted_status={"id_str": SOURCE_ID}),
                 status(card={"name": "player", "binding_values": {}}),
                 status(card={"name": "unified_card", "binding_values": {"unified_card": {"string_value": "{"}}}),
                 status([tweet_video(video_info={})]), status(mediaDetails=[])]
        for fixture in cases:
            with self.subTest(fixture=fixture), self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
                twitter_evidence(fixture, SOURCE_ID, 5)
        with self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
            twitter_evidence(status([tweet_video(), tweet_video("2")]), SOURCE_ID, 1)

    def test_syndication_cannot_hide_media_during_normalization(self):
        media = [tweet_video()]
        self.assertEqual(len(twitter_evidence(status(media, mediaDetails=copy.deepcopy(media)), SOURCE_ID, 5)["items"]), 1)
        for details in ([], [tweet_video(), tweet_video("2")], [{"type": "photo"}]):
            with self.subTest(details=details), self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
                twitter_evidence(status(media, mediaDetails=details), SOURCE_ID, 5)

    def test_private_or_live_posts_are_never_complete_public_evidence(self):
        with self.assertRaisesRegex(RuntimeError, "^source_unavailable$"):
            twitter_evidence(status(user={"protected": True}), SOURCE_ID, 5)
        with self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
            twitter_evidence(status(is_live=True), SOURCE_ID, 5)


class PinterestEvidenceTests(unittest.TestCase):
    def test_native_and_one_video_story_pins_prove_single_media(self):
        for fixture in (pin(), story_pin()):
            with self.subTest(fixture=fixture):
                proof = pinterest_evidence(fixture, PIN_ID, 5)
                self.assertEqual(proof["sourceId"], PIN_ID)
                self.assertEqual(proof["items"], [{"id": PIN_ID, "type": "video"}])

    def test_does_not_trust_unreliable_is_video_flag(self):
        self.assertEqual(pinterest_evidence(pin(is_video=False, is_playable=False), PIN_ID, 5)["originalComposition"], "complete")

    def test_photos_mixed_stories_unknown_blocks_and_external_embeds_are_rejected(self):
        cases = [pin(videos=None), pin(id="other"), pin(embed={"src": "https://vimeo.com/123"}),
                 pin(carousel_data={"items": []}), pin(carousel=True),
                 story_pin([{ "type": "story_pin_image_block", "image": {"url": "https://i.pinimg.com/photo"}}]),
                 story_pin([{ "type": "story_pin_video_block", "video": pin_video()},
                            {"type": "story_pin_image_block", "image": {"url": "https://i.pinimg.com/photo"}}]),
                 story_pin([{ "type": "unknown", "text": "Unknown rendering"}]),
                 story_pin([{ "type": "story_pin_paragraph_block", "text": "No video"}])]
        for fixture in cases:
            with self.subTest(fixture=fixture), self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
                pinterest_evidence(fixture, PIN_ID, 5)

    def test_multiple_story_videos_are_not_silently_truncated(self):
        fixture = story_pin([{"type": "story_pin_video_block", "video": pin_video()},
                             {"type": "story_pin_video_block", "video": pin_video()}])
        with self.assertRaisesRegex(RuntimeError, "^multiple_videos_unsupported$"):
            pinterest_evidence(fixture, PIN_ID, 5)

    def test_declared_story_page_count_must_match_complete_array(self):
        fixture = story_pin()
        fixture["story_pin_data"]["page_count"] = 2
        with self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
            pinterest_evidence(fixture, PIN_ID, 5)

    def test_private_hidden_or_restricted_pins_are_rejected(self):
        for fixture in (pin(privacy="private"), pin(is_hidden=True), pin(board={"privacy": "secret"})):
            with self.subTest(fixture=fixture), self.assertRaisesRegex(RuntimeError, "^source_unavailable$"):
                pinterest_evidence(fixture, PIN_ID, 5)


@unittest.skipUnless(importlib.util.find_spec("yt_dlp"), "Pinned yt-dlp is installed in the executor image")
class PinnedExtractorTests(unittest.TestCase):
    def test_twitter_wrapper_proves_actual_single_and_multi_video_results(self):
        from yt_dlp import YoutubeDL
        from yt_dlp.extractor import get_info_extractor
        from yt_dlp.extractor.twitter import TwitterIE
        request = {"sourceId": SOURCE_ID, "url": f"https://x.com/i/status/{SOURCE_ID}"}
        cls = wrap_post_extractor(get_info_extractor("Twitter"), request, {"maxItems": 5})
        for fixture in (status(), status([], card=unified_card()), status([tweet_video(), tweet_video("2")])):
            with self.subTest(fixture=fixture), YoutubeDL({"quiet": True, "noplaylist": True}) as downloader, patch.object(TwitterIE, "_extract_status", return_value=copy.deepcopy(fixture)):
                result = cls(downloader)._real_extract(request["url"])
                proof = result["_canopy_source_evidence"]
                entries = result.get("entries", [result])
                self.assertEqual(proof["sourceId"], SOURCE_ID)
                self.assertEqual([item["id"] for item in proof["items"]], [entry["id"] for entry in entries])
                self.assertTrue(all(entry["formats"] for entry in entries))
                self.assertEqual(cls.ie_key(), "Twitter")

    def test_twitter_wrapper_rejects_mixed_source_before_format_extraction(self):
        from yt_dlp import YoutubeDL
        from yt_dlp.extractor.twitter import TwitterIE
        request = {"sourceId": SOURCE_ID, "url": f"https://x.com/i/status/{SOURCE_ID}"}
        cls = wrap_post_extractor(TwitterIE, request, {"maxItems": 5})
        fixture = status([tweet_video(), {"id_str": "2", "type": "photo"}])
        with YoutubeDL({"quiet": True}) as downloader, patch.object(TwitterIE, "_extract_status", return_value=fixture), patch.object(TwitterIE, "_extract_variant_formats") as formats:
            with self.assertRaisesRegex(RuntimeError, "^unsupported_source$"):
                cls(downloader)._real_extract(request["url"])
            formats.assert_not_called()

    def test_pinterest_wrapper_uses_verified_story_video_not_cover_preview(self):
        from yt_dlp import YoutubeDL
        from yt_dlp.extractor import get_info_extractor
        from yt_dlp.extractor.pinterest import PinterestIE
        request = {"sourceId": PIN_ID, "url": f"https://www.pinterest.com/pin/{PIN_ID}/"}
        cls = wrap_post_extractor(get_info_extractor("Pinterest"), request, {"maxItems": 5})
        fixture = story_pin()
        fixture["videos"] = {"video_list": {"cover": {"url": "https://v1.pinimg.com/videos/cover.mp4"}}}
        with YoutubeDL({"quiet": True}) as downloader, patch.object(PinterestIE, "_call_api", return_value={"data": fixture}):
            result = cls(downloader)._real_extract(request["url"])
        self.assertEqual([fmt["format_id"] for fmt in result["formats"]], ["V_720P"])
        self.assertEqual(result["_canopy_source_evidence"]["items"], [{"id": PIN_ID, "type": "video"}])
        self.assertEqual(cls.ie_key(), "Pinterest")


if __name__ == "__main__":
    unittest.main()
