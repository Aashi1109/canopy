"""Original-post evidence captured before the pinned extractors filter media."""
from html import unescape
from html.parser import HTMLParser
import json
import math
import re
from urllib.parse import urlsplit


def unsupported():
    raise RuntimeError("unsupported_source")


def https_parts(value, hosts):
    try:
        parts = urlsplit(value)
        if (parts.scheme != "https" or parts.hostname not in hosts or parts.username
                or parts.password or parts.port not in (None, 443) or parts.fragment):
            unsupported()
        return parts
    except (TypeError, ValueError):
        unsupported()


def reddit_media_id(value):
    parts = https_parts(unescape(value) if isinstance(value, str) else value, {"v.redd.it"})
    match = re.fullmatch(r"/([a-z0-9]{3,64})(?:/[^\s]*)?", parts.path)
    if not match:
        unsupported()
    return match[1]


def reddit_source(data, source_id):
    """The first listing is the requested post; comments are not source media."""
    try:
        children = data[0]["data"]["children"]
        if len(children) != 1 or children[0].get("kind") != "t3":
            unsupported()
        post = children[0]["data"]
        if post.get("id") != source_id:
            unsupported()
        parents = post.get("crosspost_parent_list") or []
        if not isinstance(parents, list) or len(parents) > 1:
            unsupported()
        records = [post, *parents]
        videos = []
        for item in records:
            if isinstance(item, dict) and any(item.get(field) for field in ("over_18", "quarantine", "quarantined", "is_quarantined", "is_gated")):
                raise RuntimeError("source_unavailable")
            if (not isinstance(item, dict) or item.get("is_gallery") or item.get("gallery_data")
                    or item.get("media_metadata") or item.get("removed_by_category")
                    or item.get("is_live") or item.get("is_live_stream")
                    or item.get("subreddit_type") == "private"):
                unsupported()
            for field in ("secure_media", "media"):
                media = item.get(field)
                if media is not None:
                    if not isinstance(media, dict) or set(media) != {"reddit_video"}:
                        unsupported()
                    video = media["reddit_video"]
                    if (not isinstance(video, dict) or video.get("is_live")
                            or video.get("transcoding_status") not in (None, "completed")):
                        unsupported()
                    videos.append(video)
        if not videos:
            unsupported()
        identity = reddit_media_id(videos[0]["fallback_url"])
        # A crosspost is valid only when both records describe this same video.
        if any(reddit_media_id(item["url"]) != identity for item in records):
            unsupported()
        for video in videos:
            for field in ("fallback_url", "dash_url", "hls_url"):
                if video.get(field) and reddit_media_id(video[field]) != identity:
                    unsupported()
        return identity
    except (KeyError, IndexError, TypeError, AttributeError):
        unsupported()


def linkedin_post_id(value):
    parts = https_parts(value, {"linkedin.com", "www.linkedin.com"})
    match = re.fullmatch(r"/posts/[^/]+-(?:activity|ugcPost)-(\d{6,32})-[A-Za-z0-9_-]+/?", parts.path)
    if not match:
        match = re.fullmatch(r"/feed/update/urn:li:activity:(\d{6,32})/?", parts.path)
    if not match:
        unsupported()
    return match[1]


class LinkedInPost(HTMLParser):
    """Scope media to the primary post, excluding avatars and recommendations."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.article = None
        self.article_count = 0
        self.in_article = False
        self.videos = []
        self.all_videos = []
        self.media = []
        self.canonical = []
        self.structured = []
        self.script = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        classes = (attrs.get("class") or "").split()
        if tag == "article" and "main-feed-activity-card" in classes:
            self.article_count += 1
            self.article = attrs
            self.in_article = True
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical.append(attrs.get("href"))
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.script = ""
        if tag == "video":
            self.all_videos.append(attrs)
            if self.in_article:
                self.videos.append(attrs)
        if self.in_article and "w-main-feed-card-media" in classes:
            self.media.append(classes)
        if self.in_article and any(value.startswith(("share-images", "share-document")) for value in classes):
            unsupported()

    def handle_data(self, value):
        if self.script is not None:
            self.script += value

    def handle_endtag(self, tag):
        if tag == "article":
            self.in_article = False
        if tag == "script" and self.script is not None:
            try:
                value = json.loads(self.script)
                entries = value if isinstance(value, list) else value.get("@graph", [value])
                self.structured.extend(entry for entry in entries if isinstance(entry, dict))
            except (ValueError, TypeError, AttributeError):
                pass
            self.script = None


def linkedin_source(webpage, source_id):
    if not isinstance(webpage, str) or len(webpage) > 8 * 1024 * 1024:
        unsupported()
    page = LinkedInPost()
    page.feed(webpage)
    if (page.article_count != 1 or len(page.videos) != 1 or len(page.media) != 1
            or "share-native-video" not in page.media[0] or page.all_videos[0] != page.videos[0]
            or len(page.canonical) != 1):
        unsupported()
    activity = page.article.get("data-activity-urn")
    attributed = page.article.get("data-attributed-urn")
    if (f"urn:li:activity:{source_id}" != activity
            and f"urn:li:ugcPost:{source_id}" != attributed):
        unsupported()
    canonical_id = linkedin_post_id(page.canonical[0])
    if activity != f"urn:li:activity:{canonical_id}":
        unsupported()
    objects = [item for item in page.structured if item.get("@type") == "VideoObject"
               and item.get("@id") == page.canonical[0]]
    if len(objects) != 1:
        unsupported()
    video = objects[0]
    publication = video.get("publication") or {}
    if video.get("isLiveBroadcast") or (isinstance(publication, dict) and publication.get("isLiveBroadcast")):
        unsupported()
    try:
        sources = json.loads(page.videos[0]["data-sources"])
        if not isinstance(sources, list) or not 1 <= len(sources) <= 80:
            unsupported()
        urls = []
        for source in sources:
            url = source["src"]
            parts = urlsplit(url)
            if not parts.hostname or not parts.hostname.endswith(".licdn.com"):
                unsupported()
            https_parts(url, {parts.hostname})
            if source.get("type") not in ("video/mp4", "video/webm") or url in urls:
                unsupported()
            urls.append(url)
        if video.get("contentUrl") not in urls:
            unsupported()
    except (KeyError, TypeError, ValueError):
        unsupported()
    duration = video.get("duration")
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?", duration or "")
    seconds = sum(float(value or 0) * factor for value, factor in zip(match.groups(), (3600, 60, 1))) if match else None
    return urls, seconds if seconds and math.isfinite(seconds) else None


def wrap_extractor(extractor_class, request):
    """Wrap only these named extractors and reuse their original HTTP responses."""
    key = extractor_class.ie_key()
    if key not in ("Reddit", "LinkedIn"):
        return extractor_class
    # Subclassing yt-dlp's generated lazy proxy makes its class-name lookup
    # recurse; wrap the pinned implementation, not that proxy.
    if extractor_class.__module__ == "yt_dlp.extractor.lazy_extractors":
        extractor_class = extractor_class.real_class

    class VerifiedPost(extractor_class):
        @classmethod
        def ie_key(cls):
            return key

        def _real_initialize(self):
            if key != "Reddit":
                return super()._real_initialize()
            # The upstream initializer opts into adult/gated communities. This
            # service needs only Reddit's ordinary anonymous session cookie.
            if self._is_logged_in:
                raise RuntimeError("source_unavailable")
            self._request_webpage("https://old.reddit.com/", None,
                                  "Setting up anonymous session", "Session request failed", fatal=False)

        def _download_json(self, url, *args, **kwargs):
            data = super()._download_json(url, *args, **kwargs)
            if (key == "Reddit" and urlsplit(url).hostname == "www.reddit.com" and urlsplit(url).path.endswith("/.json")
                    and not (isinstance(data, dict) and data.get("error"))):
                self._canopy_reddit_id = reddit_source(data, request["sourceId"])
            return data

        def _download_webpage(self, url, *args, **kwargs):
            webpage = super()._download_webpage(url, *args, **kwargs)
            if key == "LinkedIn" and url == request["url"]:
                self._canopy_linkedin = linkedin_source(webpage, request["sourceId"])
            return webpage

        def _real_extract(self, url):
            info = super()._real_extract(url)
            if not isinstance(info, dict) or info.get("_type", "video") != "video" or info.get("entries") is not None:
                unsupported()
            if key == "Reddit":
                identity = getattr(self, "_canopy_reddit_id", None)
                if not identity or info.get("id") != identity or info.get("display_id") != request["sourceId"]:
                    unsupported()
                if any(reddit_media_id(fmt.get("url")) != identity for fmt in info.get("formats", [])):
                    unsupported()
            else:
                source = getattr(self, "_canopy_linkedin", None)
                identity = request["sourceId"]
                if not source or info.get("id") != identity:
                    unsupported()
                urls, duration = source
                if sorted(fmt.get("url", "") for fmt in info.get("formats", [])) != sorted(urls):
                    unsupported()
                if duration:
                    info["duration"] = duration
            info["_canopy_source_evidence"] = {
                "sourceId": request["sourceId"], "originalComposition": "complete",
                "items": [{"id": identity, "type": "video"}], "isLive": False,
                "requiresAuthentication": False, "resolvedSourceUrl": request["url"],
            }
            return info

    return VerifiedPost
