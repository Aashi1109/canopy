"""Original public-post identity/composition, independent of network availability."""
import copy
from html import escape
import importlib.util
import json
import unittest
from unittest.mock import patch

from public_post_sources import linkedin_source, reddit_source, wrap_extractor


POST = "6rrwyj"
MEDIA = "zv89llsvexdz"
ACTIVITY = "7151241570371948544"
LINKEDIN_URL = f"https://www.linkedin.com/posts/company_video-activity-{ACTIVITY}-4Gu7"
LINKEDIN_MEDIA = "https://dms.licdn.com/playlist/vid/v2/asset/video.mp4?token=fixture"


def reddit_post():
    return [{"data": {"children": [{"kind": "t3", "data": {
        "id": POST, "url": f"https://v.redd.it/{MEDIA}", "subreddit_type": "public",
        "secure_media": {"reddit_video": {
            "fallback_url": f"https://v.redd.it/{MEDIA}/DASH_720.mp4",
            "dash_url": f"https://v.redd.it/{MEDIA}/DASHPlaylist.mpd",
            "hls_url": f"https://v.redd.it/{MEDIA}/HLSPlaylist.m3u8",
            "duration": 12, "transcoding_status": "completed",
        }},
    }}]}}, {"data": {"children": []}}]


def linkedin_page(*, extra="", before="", after="", attributed=None, structured=None, sources=None):
    sources = [{"src": LINKEDIN_MEDIA, "type": "video/mp4"}] if sources is None else sources
    structured = {"@type": "VideoObject", "@id": LINKEDIN_URL, "contentUrl": LINKEDIN_MEDIA,
                  "duration": "PT2M41S"} if structured is None else structured
    return (f'<link rel="canonical" href="{LINKEDIN_URL}">'
            '<meta property="og:title" content="Public video">'
            '<meta property="og:image" content="https://media.licdn.com/thumbnail.jpg">'
            f'<script type="application/ld+json">{json.dumps(structured)}</script>{before}'
            f'<article class="main-feed-activity-card" data-activity-urn="urn:li:activity:{ACTIVITY}" '
            f'data-attributed-urn="urn:li:ugcPost:{attributed or ACTIVITY}">'
            '<img class="hue-web-entity__image" src="https://media.licdn.com/avatar.png">'
            '<div class="share-native-video w-main-feed-card-media">'
            f'<video data-sources="{escape(json.dumps(sources), quote=True)}"></video></div>'
            f'{extra}</article>{after}')


class RedditSources(unittest.TestCase):
    def test_original_hosted_video_and_duplicate_media_metadata(self):
        data = reddit_post()
        post = data[0]["data"]["children"][0]["data"]
        post["media"] = copy.deepcopy(post["secure_media"])
        self.assertEqual(reddit_source(data, POST), MEDIA)

    def test_crosspost_must_describe_the_same_original_video(self):
        data = reddit_post()
        post = data[0]["data"]["children"][0]["data"]
        parent = copy.deepcopy(post)
        parent["id"] = "other123"
        post["secure_media"] = None
        post["crosspost_parent_list"] = [parent]
        self.assertEqual(reddit_source(data, POST), MEDIA)
        parent["url"] = "https://v.redd.it/different123"
        with self.assertRaisesRegex(RuntimeError, "unsupported_source"):
            reddit_source(data, POST)

    def test_rejects_filtered_images_collections_private_live_and_external_media(self):
        mutations = [
            {"id": "different"}, {"is_gallery": True}, {"gallery_data": {"items": [{"media_id": "photo"}]}},
            {"media_metadata": {"photo": {"e": "Image"}, MEDIA: {"e": "RedditVideo"}}},
            {"media_metadata": {MEDIA: {"e": "RedditVideo"}}},
            {"subreddit_type": "private"}, {"is_live": True}, {"is_live_stream": True},
            {"removed_by_category": "deleted"}, {"secure_media": None},
            {"url": "https://www.youtube.com/watch?v=abcdefghijk"},
            {"secure_media": {"oembed": {"type": "video"}}},
            {"crosspost_parent_list": [{}, {}]},
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                data = reddit_post()
                data[0]["data"]["children"][0]["data"].update(mutation)
                with self.assertRaisesRegex(RuntimeError, "unsupported_source"):
                    reddit_source(data, POST)

    def test_all_manifests_must_belong_to_same_media_on_reddit_https(self):
        for value in ("https://example.com/video", f"http://v.redd.it/{MEDIA}/video", "https://v.redd.it/otherid/video",
                      f"https://user:password@v.redd.it/{MEDIA}/video", f"https://v.redd.it:444/{MEDIA}/video"):
            data = reddit_post()
            data[0]["data"]["children"][0]["data"]["secure_media"]["reddit_video"]["dash_url"] = value
            with self.subTest(value=value), self.assertRaisesRegex(RuntimeError, "unsupported_source"):
                reddit_source(data, POST)

    def test_age_and_community_gates_remain_unavailable_in_original_or_crosspost(self):
        for flag in ("over_18", "quarantine", "quarantined", "is_quarantined", "is_gated"):
            for parent in (False, True):
                data = reddit_post()
                post = data[0]["data"]["children"][0]["data"]
                target = copy.deepcopy(post) if parent else post
                target[flag] = True
                if parent:
                    post["crosspost_parent_list"] = [target]
                with self.subTest(flag=flag, crosspost=parent), self.assertRaisesRegex(RuntimeError, "source_unavailable"):
                    reddit_source(data, POST)

    def test_wrapper_validates_before_extractor_can_filter_or_delegate(self):
        data = reddit_post()
        class RedditIE:
            @classmethod
            def ie_key(cls): return "Reddit"
            def _download_json(self, *args, **kwargs): return copy.deepcopy(data)
            def _real_extract(self, url):
                self._download_json(f"https://www.reddit.com/comments/{POST}/.json")
                return {"id": MEDIA, "display_id": POST, "formats": [{"url": f"https://v.redd.it/{MEDIA}/video.mp4"}]}
        request = {"url": f"https://www.reddit.com/comments/{POST}/", "sourceId": POST}
        wrapped = wrap_extractor(RedditIE, request)()
        result = wrapped._real_extract(request["url"])
        self.assertEqual(result["id"], MEDIA)
        self.assertEqual(result["_canopy_source_evidence"]["sourceId"], POST)
        self.assertEqual(result["_canopy_source_evidence"]["items"], [{"id": MEDIA, "type": "video"}])
        data[0]["data"]["children"][0]["data"]["media_metadata"] = {"hidden_photo": {"e": "Image"}}
        with self.assertRaisesRegex(RuntimeError, "unsupported_source"):
            wrapped._real_extract(request["url"])


class LinkedInSources(unittest.TestCase):
    def test_public_video_and_ugcpost_alias_are_bound_to_primary_article(self):
        self.assertEqual(linkedin_source(linkedin_page(), ACTIVITY), ([LINKEDIN_MEDIA], 161.0))
        self.assertEqual(linkedin_source(linkedin_page(attributed="6850898786781339649"), "6850898786781339649"),
                         ([LINKEDIN_MEDIA], 161.0))

    def test_avatars_and_later_recommendation_videos_do_not_change_post_media(self):
        page = linkedin_page(after='<article><video data-sources="[]"></video></article>')
        self.assertEqual(linkedin_source(page, ACTIVITY)[0], [LINKEDIN_MEDIA])

    def test_rejects_mixed_posts_and_multiple_or_mismatched_first_video(self):
        cases = [linkedin_page(extra='<div class="share-images"><img></div>'),
                 linkedin_page(extra='<div class="share-document"></div>'),
                 linkedin_page(extra='<video data-sources="[]"></video>'),
                 linkedin_page(extra='<div class="w-main-feed-card-media"></div>'),
                 linkedin_page(before='<video data-sources="[]"></video>'),
                 linkedin_page().replace(ACTIVITY, "7151241570371948555"),
                 '<html>Please sign in</html>']
        for page in cases:
            with self.subTest(page=page[:80]), self.assertRaisesRegex(RuntimeError, "unsupported_source"):
                linkedin_source(page, ACTIVITY)

    def test_requires_matching_structured_video_identity_and_public_native_url(self):
        for changes in ({"@type": "ImageObject"}, {"@id": "https://www.linkedin.com/posts/other"},
                        {"contentUrl": "https://example.com/video"}, {"isLiveBroadcast": True},
                        {"publication": {"isLiveBroadcast": True}}):
            structured = {"@type": "VideoObject", "@id": LINKEDIN_URL, "contentUrl": LINKEDIN_MEDIA}
            structured.update(changes)
            with self.subTest(changes=changes), self.assertRaisesRegex(RuntimeError, "unsupported_source"):
                linkedin_source(linkedin_page(structured=structured), ACTIVITY)
        for value in ("https://licdn.com.evil.com/video", "https://example.com/video", "http://dms.licdn.com/video",
                      "https://user:password@dms.licdn.com/video", "https://dms.licdn.com:444/video"):
            with self.subTest(value=value), self.assertRaisesRegex(RuntimeError, "unsupported_source"):
                linkedin_source(linkedin_page(sources=[{"src": value, "type": "video/mp4"}]), ACTIVITY)

    def test_wrapper_keeps_extractor_formats_but_rejects_unverified_replacement(self):
        returned_url = LINKEDIN_MEDIA
        class LinkedInIE:
            @classmethod
            def ie_key(cls): return "LinkedIn"
            def _download_webpage(self, *args, **kwargs): return linkedin_page()
            def _real_extract(self, url):
                self._download_webpage(url)
                return {"id": ACTIVITY, "formats": [{"url": returned_url}]}
        request = {"url": LINKEDIN_URL, "sourceId": ACTIVITY}
        wrapped = wrap_extractor(LinkedInIE, request)()
        result = wrapped._real_extract(LINKEDIN_URL)
        self.assertEqual(result["duration"], 161.0)
        self.assertEqual(result["formats"], [{"url": LINKEDIN_MEDIA}])
        self.assertEqual(result["_canopy_source_evidence"]["items"], [{"id": ACTIVITY, "type": "video"}])
        returned_url = "https://dms.licdn.com/unrelated/video"
        with self.assertRaisesRegex(RuntimeError, "unsupported_source"):
            wrapped._real_extract(LINKEDIN_URL)


@unittest.skipUnless(importlib.util.find_spec("yt_dlp"), "Pinned engine is installed in the executor image")
class PinnedExtractorSources(unittest.TestCase):
    def test_linkedin_generated_proxy_wraps_real_extractor_and_captures_original_html(self):
        import yt_dlp
        from yt_dlp.extractor import get_info_extractor
        from yt_dlp.extractor.linkedin import LinkedInIE
        request = {"url": LINKEDIN_URL, "sourceId": ACTIVITY}
        with patch.object(LinkedInIE, "_download_webpage", return_value=linkedin_page()) as fetch:
            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}, auto_init=False) as downloader:
                downloader.add_info_extractor(wrap_extractor(get_info_extractor("LinkedIn"), request)())
                info = downloader.extract_info(LINKEDIN_URL, download=False)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(info["duration"], 161)
        self.assertEqual(info["_canopy_source_evidence"]["sourceId"], ACTIVITY)
        self.assertEqual(len(info["formats"]), 1)

    def test_reddit_generated_proxy_proves_original_media_without_duplicate_json_fetch(self):
        import yt_dlp
        from yt_dlp.extractor import get_info_extractor
        from yt_dlp.extractor.reddit import RedditIE
        request = {"url": f"https://www.reddit.com/r/videos/comments/{POST}/", "sourceId": POST}
        data = reddit_post()
        data[0]["data"]["children"][0]["data"]["title"] = "Public video"
        with (patch.object(RedditIE, "_download_json", return_value=data) as fetch,
              patch.object(RedditIE, "_real_initialize"),
              patch.object(RedditIE, "_request_webpage"),
              patch.object(RedditIE, "_get_cookies", return_value={"loid": object()}),
              patch.object(RedditIE, "_extract_m3u8_formats_and_subtitles", return_value=([], {})),
              patch.object(RedditIE, "_extract_mpd_formats_and_subtitles", return_value=([], {}))):
            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}, auto_init=False) as downloader:
                downloader.add_info_extractor(wrap_extractor(get_info_extractor("Reddit"), request)())
                info = downloader.extract_info(request["url"], download=False)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(info["id"], MEDIA)
        self.assertEqual(info["display_id"], POST)
        self.assertEqual(info["_canopy_source_evidence"]["sourceId"], POST)
        self.assertEqual(info["_canopy_source_evidence"]["items"], [{"id": MEDIA, "type": "video"}])

    def test_reddit_initialization_only_requests_anonymous_session_without_optin_cookies(self):
        import yt_dlp
        from yt_dlp.extractor import get_info_extractor
        from yt_dlp.extractor.reddit import RedditIE
        request = {"url": f"https://www.reddit.com/r/videos/comments/{POST}/", "sourceId": POST}
        with (patch.object(RedditIE, "_get_cookies", return_value={}),
              patch.object(RedditIE, "_set_cookie") as set_cookie,
              patch.object(RedditIE, "_request_webpage") as fetch):
            extractor = wrap_extractor(get_info_extractor("Reddit"), request)()
            extractor._real_initialize()
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[0], "https://old.reddit.com/")
        set_cookie.assert_not_called()


if __name__ == "__main__":
    unittest.main()
