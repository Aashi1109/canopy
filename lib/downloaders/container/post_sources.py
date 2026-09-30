"""Prove a post's original media before an extractor can omit non-video items."""
import json
import re


def _identity(value):
    if isinstance(value, int) and not isinstance(value, bool):
        value = str(value)
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", value):
        raise RuntimeError("unsupported_source")
    return value


def _public(data):
    if any(data.get(field) is True for field in ("protected", "is_private", "is_secret", "is_hidden", "requires_authentication")) or data.get("privacy") in ("private", "secret", "restricted"):
        raise RuntimeError("source_unavailable")
    if data.get("is_live") or data.get("live_status") in ("is_live", "is_upcoming", "post_live"):
        raise RuntimeError("unsupported_source")


def _evidence(source_id, identities, max_items):
    if not identities or len(identities) > min(max_items, 5) or len(set(identities)) != len(identities):
        raise RuntimeError("unsupported_source")
    return {"sourceId": source_id, "originalComposition": "complete",
            "items": [{"id": identity, "type": "video"} for identity in identities],
            "isLive": False, "requiresAuthentication": False}


def twitter_evidence(status, source_id, max_items):
    """Read the unfiltered legacy/GraphQL media list, including photo entries."""
    if not isinstance(status, dict) or _identity(status.get("id_str", status.get("id"))) != source_id:
        raise RuntimeError("unsupported_source")
    _public(status)
    user = status.get("user")
    if isinstance(user, dict):
        _public(user)
    # These are separate sources that the stock extractor may add to this post.
    # Never delegate, or claim that a selected quote/retweet is the requested post.
    if status.get("retweeted_status"):
        raise RuntimeError("unsupported_source")
    for key in ("quoted_status", "quoted_tweet"):
        quote = status.get(key)
        if isinstance(quote, dict) and any(quote.get(field) for field in ("extended_entities", "mediaDetails", "photos", "video", "card")):
            raise RuntimeError("unsupported_source")
    entities = status.get("extended_entities")
    media = entities.get("media", []) if isinstance(entities, dict) else []
    if not isinstance(media, list) or len(media) > min(max_items, 5):
        raise RuntimeError("unsupported_source")
    # Syndication keeps mediaDetails after yt-dlp transforms it. Require that
    # transformation to preserve every original item rather than trust a filter.
    details = status.get("mediaDetails")
    if details is not None and (not isinstance(details, list) or len(details) != len(media)):
        raise RuntimeError("unsupported_source")
    if status.get("photos"):
        raise RuntimeError("unsupported_source")
    card = status.get("card")
    if card:
        if not isinstance(card, dict) or str(card.get("name", "")).split(":")[-1] != "unified_card":
            raise RuntimeError("unsupported_source")
        values = card.get("binding_values")
        unified = values.get("unified_card") if isinstance(values, dict) else None
        encoded = unified.get("string_value") if isinstance(unified, dict) else None
        if not isinstance(encoded, str) or not 1 <= len(encoded) <= 262_144:
            raise RuntimeError("unsupported_source")
        try:
            parsed = json.loads(encoded)
        except (ValueError, RecursionError):
            raise RuntimeError("unsupported_source") from None
        card_media = parsed.get("media_entities") if isinstance(parsed, dict) else None
        if not isinstance(card_media, dict) or not card_media or len(card_media) > min(max_items, 5):
            raise RuntimeError("unsupported_source")
        media = [*media, *card_media.values()]
    identities = []
    for item in media:
        if not isinstance(item, dict) or item.get("type") not in ("video", "animated_gif"):
            raise RuntimeError("unsupported_source")
        _public(item)
        video = item.get("video_info")
        if not isinstance(video, dict) or not isinstance(video.get("variants"), list) or not video["variants"]:
            raise RuntimeError("unsupported_source")
        identities.append(_identity(item.get("id_str", item.get("id"))))
    if details is not None and any(not isinstance(item, dict) or item.get("type") not in ("video", "animated_gif") for item in details):
        raise RuntimeError("unsupported_source")
    return _evidence(source_id, identities, max_items)


def pinterest_evidence(data, source_id, max_items):
    """Verify every page/block before PinterestIE chooses the first video list."""
    if not isinstance(data, dict) or _identity(data.get("id")) != source_id:
        raise RuntimeError("unsupported_source")
    _public(data)
    if data.get("carousel_data") or data.get("carousel") or data.get("access"):
        raise RuntimeError("unsupported_source")
    board = data.get("board")
    if isinstance(board, dict):
        _public(board)
        if board.get("privacy") in ("secret", "private"):
            raise RuntimeError("source_unavailable")
    embed = data.get("embed")
    if isinstance(embed, dict) and embed.get("src"):
        raise RuntimeError("unsupported_source")
    story = data.get("story_pin_data")
    if story is not None:
        if not isinstance(story, dict):
            raise RuntimeError("unsupported_source")
        pages = story.get("pages")
        if not isinstance(pages, list) or not 1 <= len(pages) <= min(max_items, 5):
            raise RuntimeError("unsupported_source")
        # If the response declares a total, a truncated page array is not proof.
        for key in ("page_count", "total_pages"):
            if key in story and (type(story[key]) is not int or story[key] != len(pages)):
                raise RuntimeError("unsupported_source")
        count = 0
        for page in pages:
            blocks = page.get("blocks") if isinstance(page, dict) else None
            if not isinstance(blocks, list) or not 1 <= len(blocks) <= 100:
                raise RuntimeError("unsupported_source")
            for block in blocks:
                if isinstance(block, dict) and block.get("type") == "story_pin_paragraph_block" and not any(block.get(field) for field in ("video", "image", "media")):
                    continue
                video = block.get("video") if isinstance(block, dict) else None
                if not isinstance(video, dict) or block.get("image") or not isinstance(video.get("video_list"), dict) or not video["video_list"]:
                    raise RuntimeError("unsupported_source")
                count += 1
        if not count:
            raise RuntimeError("unsupported_source")
        if count > 1:
            # The current picker represents one video. Do not silently return
            # the first story page as though the complete pin was downloaded.
            raise RuntimeError("multiple_videos_unsupported")
    else:
        video = data.get("videos")
        if not isinstance(video, dict) or not isinstance(video.get("video_list"), dict) or not video["video_list"]:
            raise RuntimeError("unsupported_source")
    return _evidence(source_id, [source_id], max_items)


def _attach(result, evidence, source_url):
    if not isinstance(result, dict):
        raise RuntimeError("unsupported_source")
    entries = result.get("entries")
    if entries is None:
        entries = [result]
    if not isinstance(entries, (list, tuple)) or len(entries) != len(evidence["items"]):
        raise RuntimeError("unsupported_source")
    identities = []
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("_type", "video") != "video" or "entries" in entry:
            raise RuntimeError("unsupported_source")
        _public(entry)
        identities.append(_identity(entry.get("id")))
    if identities != [item["id"] for item in evidence["items"]]:
        raise RuntimeError("unsupported_source")
    result["_canopy_source_evidence"] = {**evidence, "resolvedSourceUrl": source_url}
    return result


def wrap_post_extractor(extractor_class, request, limits):
    """Keep yt-dlp's named extractor and formats; add original-post evidence."""
    key = extractor_class.ie_key()
    if key not in ("Twitter", "Pinterest"):
        return extractor_class
    # yt-dlp's registry returns lazy proxy classes. Their metaclass resolves
    # from the original class name; subclassing the proxy would recurse.
    if extractor_class.__module__ == "yt_dlp.extractor.lazy_extractors":
        extractor_class = extractor_class.real_class
    source_id = request["sourceId"]
    max_items = limits["maxItems"]

    if key == "Twitter":
        class VerifiedTwitter(extractor_class):
            @classmethod
            def ie_key(cls):
                return key

            def _extract_status(self, twid):
                if twid != source_id:
                    raise RuntimeError("unsupported_source")
                status = super()._extract_status(twid)
                self._canopy_evidence = twitter_evidence(status, source_id, max_items)
                return status

            def _real_extract(self, url):
                self._canopy_evidence = None
                result = super()._real_extract(url)
                if self._canopy_evidence is None:
                    raise RuntimeError("unsupported_source")
                return _attach(result, self._canopy_evidence, request["url"])
        return VerifiedTwitter

    class VerifiedPinterest(extractor_class):
        @classmethod
        def ie_key(cls):
            return key

        def _extract_video(self, data, extract_formats=True):
            evidence = pinterest_evidence(data, source_id, max_items)
            if data.get("story_pin_data") is not None:
                # Use the verified story video rather than a top-level cover or
                # preview that Pinterest may include alongside the story pages.
                video = next(block["video"] for page in data["story_pin_data"]["pages"] for block in page["blocks"] if block.get("video"))
                data = {**data, "videos": video}
            result = super()._extract_video(data, extract_formats)
            return _attach(result, evidence, request["url"])
    return VerifiedPinterest
