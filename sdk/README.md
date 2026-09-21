# BucketView Browser SDK

`bucketview-sdk.js` is a dependency-free browser ESM module for opening
BucketView from a web application.

```html
<script type="module">
  import { BucketView } from './bucketview-sdk.js';

  const connection = {
    id: 'production-assets',
    endpoint: 's3.example.com',
    accessKeyId: 'AK...',
    accessKeySecret: 'SK...',
    region: 'us-east-1',
    useSSL: true,
    pathStyle: true,
  };

  const uri = await BucketView.createFileUri(connection, {
    bucket: 'website',
    objectName: 'releases/index.html',
  }, { expiresInSeconds: 15 * 60 });

  BucketView.open(uri);
</script>
```

## API

`createReadonlyConnectionUri(connection, options)` creates a persistent,
readonly connection-import URI. BucketView saves this connection locally after
the user opens the link. The UI does not allow viewing or editing its keys.

`createDirectoryUri(connection, { bucket, pathPrefix }, options)` creates an
ephemeral URI that opens a bucket or directory. It is only retained in memory
for the current BucketView session.

`createFileUri(connection, { bucket, objectName, pathPrefix? }, options)`
creates an ephemeral URI that opens the parent directory and previews the
object. `pathPrefix` is optional; when omitted, the object's parent directory
is used.

`options` may use one of `expiresAt` (a `Date` or Unix milliseconds),
`expiresInMs`, or `expiresInSeconds`. Omit it for no expiry.

## Security model

The URI is AES-GCM encrypted only to avoid exposing credential fields in the
address text. The random encryption key is part of the URI, so anyone holding
the complete URI can decrypt and use its credentials. Treat it like a password.

An expiry prevents a future import/open after that time. It cannot revoke a
connection that has already been imported, and it cannot invalidate credentials
already copied from the URI. Revocable access requires server-issued temporary
credentials or a server-side token service.
