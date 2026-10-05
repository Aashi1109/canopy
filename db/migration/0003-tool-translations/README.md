# Embedded tool translations

Run against the intended application database before deploying the localized catalog:

```sh
pnpm db:migrate 0003-tool-translations
node db/scripts/seed-tool-translations.mjs
```

The migration adds `managed_tools.translations`; it creates no translation table.
The translation backfill initializes English from each deployed definition and
its currently published database content. It fills missing English keys, removes
retired English keys, preserves saved values for retained keys and translated
messages, and sends other languages back to draft when the source key set changes.
Paperwork tools also receive the message contract for their existing workspace.
Other tools without a deployed definition initially receive their stored name
and description; later seeding adds their deployed fields.

It does not create tools, seed invoice templates, or upload icon assets.
Both commands load `.env.local`, then `.env`, with
explicit shell variables taking precedence. Restart running application instances
after applying the migration.

In **Admin → Tools → a tool → Translations**, complete a language's text and publish
it to expose its public page. Saving a draft removes that language from publication.
English must remain published while the tool is enabled. Enabling a tool validates
its complete English dictionary against the deployed definition. The editor shows
current fields; republishing removes retired keys from that language. Existing Catalog & SEO
and Content document changes synchronize affected English text and require other
languages to be reviewed again. A stale editing session is rejected rather than
overwriting a newer save.

Tool translations are authored in the database. The backfill initializes English;
it does not invent or publish other languages. The public shell supports English,
Hindi, Spanish, French, German, Brazilian Portuguese, Arabic, Simplified Chinese,
Japanese and Russian. Untranslated tools remain discoverable through their English
URL until a complete translation is published.

English translation saves preserve unpublished Content document drafts and example
inputs/settings. Publishing or discarding a content draft remains its own action.
This branch still loads trusted execution definitions from code; carry the same
embedded translations field forward when those definitions move to the database.
