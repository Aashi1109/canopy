import assert from "node:assert/strict";
import test from "node:test";
import {
  blogCanonicalUrl,
  blogArticleMetadata,
  blogStructuredData,
  buildBlogFeed,
} from "../lib/blog/publication.ts";
import { createBlogDocument } from "../lib/blog/document.ts";

const post = {
  slug: "first-post",
  document: {
    ...createBlogDocument("Title <&>"),
    excerpt: "Useful summary",
    seoTitle: "SEO title",
  },
  firstPublishedAt: new Date("2026-09-16T00:00:00Z"),
  publishedUpdatedAt: new Date("2026-09-16T01:00:00Z"),
};
test("article metadata uses canonical immutable slug, explicit overrides and publication dates", () => {
  assert.equal(
    blogCanonicalUrl("first-post", "https://example.test/base"),
    "https://example.test/blog/first-post",
  );
  assert.throws(() => blogCanonicalUrl("../private", "https://example.test"));
  assert.throws(() => blogCanonicalUrl("post", "javascript:alert(1)"));
  const metadata = blogArticleMetadata(post, "https://example.test");
  assert.equal(metadata.title, "SEO title");
  assert.equal(metadata.description, "Useful summary");
  assert.equal(metadata.alternates.canonical, "https://example.test/blog/first-post");
  assert.equal(metadata.openGraph.publishedTime, "2026-09-16T00:00:00.000Z");
  assert.equal(metadata.openGraph.modifiedTime, "2026-09-16T01:00:00.000Z");
  assert.throws(
    () => blogArticleMetadata({ ...post, firstPublishedAt: null }, "https://example.test"),
    /timestamp/,
  );
  assert.throws(() => blogCanonicalUrl("post", "https://user:pass@example.test"));
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  try {
    const imagePost = {
      ...post,
      document: {
        ...post.document,
        coverImage: {
          publicId: "smarttools/blog/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          version: 123,
          format: "png",
          width: 1200,
          height: 630,
          alt: "Cover",
          caption: "",
        },
      },
    };
    const withImage = blogArticleMetadata(imagePost, "https://example.test");
    assert.equal(withImage.twitter.card, "summary_large_image");
    assert.equal(
      withImage.openGraph.images[0].url,
      "https://res.cloudinary.com/test-cloud/image/upload/v123/smarttools/blog/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png",
    );
    assert.equal(
      JSON.parse(blogStructuredData(imagePost, "https://example.test")).image,
      withImage.openGraph.images[0].url,
    );
  } finally {
    if (cloud === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
    else process.env.CLOUDINARY_CLOUD_NAME = cloud;
  }
});
test("structured data is safe to embed in an application/ld+json script", () => {
  const json = blogStructuredData(
    { ...post, document: { ...post.document, title: "</script><script>alert(1)</script>" } },
    "https://example.test",
  );
  assert.doesNotMatch(json, /<script|<\/script/i);
  const data = JSON.parse(json);
  assert.equal(data["@type"], "BlogPosting");
  assert.equal(data.author.name, "SmartTools Team");
  assert.equal(data.mainEntityOfPage, "https://example.test/blog/first-post");
});
test("RSS escapes stored text and uses publication dates rather than draft updates", () => {
  const xml = buildBlogFeed(
    [
      {
        slug: post.slug,
        title: '<Title & "quote">',
        excerpt: "Description </item>",
        authorName: "Writer",
        firstPublishedAt: post.firstPublishedAt,
        publishedUpdatedAt: post.publishedUpdatedAt,
      },
    ],
    "https://example.test",
  );
  assert.match(xml, /&lt;Title &amp; &quot;quote&quot;&gt;/);
  assert.match(xml, /Description &lt;\/item&gt;/);
  assert.match(xml, /<pubDate>Wed, 16 Sep 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(xml, /https:\/\/example.test\/blog\/first-post/);
  assert.doesNotMatch(xml, /draft|actor|createdBy/);
  assert.match(buildBlogFeed([], "https://example.test"), /<channel>/);
});
