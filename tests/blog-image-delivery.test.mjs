import assert from "node:assert/strict";
import test from "node:test";
import { blogImageDelivery } from "../lib/blog/utils.ts";

const image = {
  publicId: "Canopy/production/blog/95c40d91-c008-4474-965b-71ec2e4f2b81",
  version: 1234,
  format: "webp",
  width: 2400,
};

test("responsive image candidates stay within the source width and delivery cap without duplicates", () => {
  for (const [width, expected] of [
    [1, [1]],
    [319, [319]],
    [320, [320]],
    [640, [320, 640]],
    [800, [320, 640, 800]],
    [1280, [320, 640, 960, 1280]],
    [2400, [320, 640, 960, 1280, 1920, 2400]],
    [2560, [320, 640, 960, 1280, 1920, 2560]],
    [30000, [320, 640, 960, 1280, 1920, 2560]],
  ]) {
    const delivery = blogImageDelivery({ ...image, width }, "my-cloud");
    const candidates = delivery.srcSet.split(", ").map((candidate) => {
      const [url, descriptor] = candidate.split(" ");
      const candidateWidth = Number.parseInt(descriptor, 10);
      assert.equal(descriptor, `${candidateWidth}w`);
      assert.ok(candidateWidth <= width);
      assert.equal(
        url,
        `https://res.cloudinary.com/my-cloud/image/upload/c_limit,w_${candidateWidth}/q_auto/f_auto/v1234/${image.publicId}.webp`,
      );
      return candidateWidth;
    });
    assert.deepEqual(candidates, expected, `source width ${width}`);
    assert.equal(
      delivery.src,
      `https://res.cloudinary.com/my-cloud/image/upload/c_limit,w_${Math.min(width, 1280)}/q_auto/f_auto/v1234/${image.publicId}.webp`,
    );
  }
});

test("delivery preserves immutable versions and source formats while requesting automatic quality and format", () => {
  for (const format of ["jpg", "jpeg", "png", "webp"]) {
    const source = Object.freeze({ ...image, format, version: 987654321 });
    const delivery = blogImageDelivery(source, "cloud_2");
    for (const url of [delivery.src, ...delivery.srcSet.split(", ").map((candidate) => candidate.split(" ")[0])]) {
      assert.ok(url.endsWith(`/q_auto/f_auto/v987654321/${image.publicId}.${format}`));
    }
    assert.equal(source.format, format);
    assert.equal(source.width, 2400);
  }
});

test("delivery encodes individual public ID segments while retaining their folder path", () => {
  const delivery = blogImageDelivery({ ...image, publicId: "folder name/diagram #1+é", width: 320 }, "my-cloud");
  assert.equal(
    delivery.src,
    "https://res.cloudinary.com/my-cloud/image/upload/c_limit,w_320/q_auto/f_auto/v1234/folder%20name/diagram%20%231%2B%C3%A9.webp",
  );
  assert.equal(delivery.srcSet, `${delivery.src} 320w`);
});

test("delivery rejects missing or unsafe cloud names", () => {
  for (const cloudName of ["", "cloud/name", "cloud.example", "cloud?x=1", 'cloud"', " cloud", "cloud\n"]) {
    assert.throws(() => blogImageDelivery(image, cloudName), /configured Cloudinary cloud/);
  }
});
