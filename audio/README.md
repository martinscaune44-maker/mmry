# Audio files

Drop your narration/music files here and reference them from `zones.js`
(the `audio` field on each zone), e.g.:

```
audio/zone-1.mp3
audio/zone-2.mp3
audio/zone-3.mp3
```

Any browser-supported format works (mp3, ogg, m4a). Keep files reasonably
small — they're fetched over the mobile connection when a zone is entered
(unless the browser has already cached them).
