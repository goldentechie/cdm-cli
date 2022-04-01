import log from 'loglevel';
import fs from 'fs';
import path from 'path';
import { NFTStorageMetaplexor } from '@nftstorage/metaplex-auth';
import { NFTStorage, Blob } from 'nft.storage';
import { Keypair } from '@solana/web3.js';

interface _prevMedia {
  [key: string]: string
}

var prevMedia: _prevMedia ={};

export async function nftStorageUpload(
  image: string,
  animation: string,
  dir: string,
  manifestBuffer: Buffer,
  walletKeyPair: Keypair,
  env: string,
  nftStorageKey: string | null,
) {
  // If we have an API token, use the default NFTStorage client.
  // Otherwise, use NFTStorageMetaplexor, which uses a signature
  // from the wallet key to authenticate.
  // See https://github.com/nftstorage/metaplex-auth for details.
  const client = nftStorageKey
    ? new NFTStorage({ token: nftStorageKey })
    : NFTStorageMetaplexor.withSecretKey(walletKeyPair.secretKey, {
        solanaCluster: env,
        mintingAgent: 'metaplex/candy-machine-v2-cli',
      });

  async function uploadMedia(media) {
    try {
      if(prevMedia[media]) 
      {
        log.info(`${media} skipped`)
        return prevMedia[media];
      }
      const readStream = fs.createReadStream(media);
      log.info(`Media Upload ${media}`);
      // @ts-ignore - the Blob type expects a web ReadableStream, but also works with node Streams.
      const cid = await client.storeBlob({ stream: () => readStream });
      prevMedia[media] = `https://${cid}.ipfs.dweb.link`;
      return `https://${cid}.ipfs.dweb.link`;
    } catch (err) {
      log.debug(err);
      console.log(media)
      throw new Error(`Media upload error: ${err}`);
    }
  }

  async function uploadMetadata(manifestJson, imageUrl, animationUrl) {
    try {
      log.info('Upload metadata');
      const metaData = Buffer.from(JSON.stringify(manifestJson));
      const cid = await client.storeBlob(new Blob([metaData]));
      const link = `https://${cid}.ipfs.dweb.link`;
      log.info('Upload end');
      if (animationUrl) {
        log.debug([link, imageUrl, animationUrl]);
      } else {
        log.debug([link, imageUrl]);
      }
      return [link, imageUrl, animationUrl];
    } catch (err) {
      log.debug(err);
      throw new Error(`Metadata upload error: ${err}`);
    }
  }

  // Copied from ipfsUpload
  const imageUrl = `${await uploadMedia(image)}?ext=${path
    .extname(image)
    .replace('.', '')}`;
  const animationUrl = animation
    ? `${await uploadMedia(animation)}?ext=${path
        .extname(animation)
        .replace('.', '')}`
    : undefined;
  const manifestJson = JSON.parse(manifestBuffer.toString('utf8'));
  manifestJson.image = imageUrl;
  if (animation) {
    manifestJson.animation_url = animationUrl;
  }
  if (manifestJson.properties.category == 'video')
    manifestJson.properties.files[0].uri = animationUrl;
  else manifestJson.properties.files[0].uri = imageUrl;
  return uploadMetadata(manifestJson, imageUrl, animationUrl);
}
