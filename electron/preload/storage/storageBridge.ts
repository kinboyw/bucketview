import {
  Storage,
  Connection,
  DeleteObjectResponse,
  CreateDirectoryResponse,
  TransferObjectOption,
  ListObjectsResponse,
  SignObjectResponse,
} from '../types';
import { Transfer } from './transfer';
import { EventEmitter } from 'events';

export class StorageBridge extends EventEmitter{
    private storages: { [key: string]: Storage } = {}
    private transfer: any

    constructor(storages: { [key: string]: Storage }, transfer: Transfer) {
      super()
      this.storages = storages
      this.transfer = transfer
    }

    changeConfig(key: string, connection: Connection): void {
      this.storages[key]?.changeConfig(connection);
    }

    setTarget(key: string, bucket: string, pathPrefix?: string): void {
      this.storages[key]?.setTarget(bucket, pathPrefix);
    }

    listBuckets(key: string): Promise<string[]> {
      return this.storages[key]?.listBuckets();
    }

    getObject(key: string, options: TransferObjectOption): void {
      const storage = this.storages[key];
      this.transfer.Add({
        type: 'download',
        key: key,
        uid: options.uid,
        prefix: options.prefix,
        objectName: options.objectName,
        localPath: options.localPath,
        storage,
      });
    }

    putObject(key: string, options: TransferObjectOption): void {
      const storage = this.storages[key];
      this.transfer.Add({
        type: 'upload',
        key: key,
        uid: options.uid,
        prefix: options.prefix,
        objectName: options.objectName,
        localPath: options.localPath,
        storage,
      });
    }

    listObjects(key: string, prefix: string, startAfter: string): Promise<ListObjectsResponse> {
      return this.storages[key]?.listObjects(prefix, startAfter);
    }

    deleteObject(key: string, filenames: string[]): Promise<DeleteObjectResponse> {
      return this.storages[key]?.deleteObject(filenames);
    }

    signObject(key: string, objectName: string): Promise<SignObjectResponse> {
      return this.storages[key]?.signObject(objectName);
    }

    createDirectory(key: string, prefix: string): Promise<CreateDirectoryResponse> {
      return this.storages[key]?.createDirectory(prefix);
    }

    deleteDirectory(key: string, prefix: string): Promise<CreateDirectoryResponse> {
      return this.storages[key]?.deleteDirectory(prefix);
    }

}
