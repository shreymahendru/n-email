import "@nivinjoseph/n-ext";
import * as Path from "path";
import { S3 } from "aws-sdk";
import * as Mime from "mime-types";
import { given } from "@nivinjoseph/n-defensive";
import { Uuid } from "@nivinjoseph/n-util";
import { ArgumentException } from "@nivinjoseph/n-exception";
const loaderUtils = require("loader-utils");


module.exports = function (content: any)
{
    if (typeof content === "string")
        content = Buffer.from(content);

    const callback = this.async();

    const options: Object = loaderUtils.getOptions(this) || {};

    const awsS3AccessKeyId = options.getValue("awsS3AccessKeyId") as string;
    const awsS3SecretAccessKey = options.getValue("awsS3SecretAccessKey") as string;
    const awsS3Bucket = options.getValue("awsS3Bucket") as string;

    const fileStore = new S3FileStore(awsS3AccessKeyId, awsS3SecretAccessKey, awsS3Bucket);
    fileStore.store(Path.basename(this.resourcePath), content)
        .then(url => callback(null, `module.exports = ${JSON.stringify(url)}`))
        .catch(e => callback(e));
};

module.exports.raw = true;


class S3FileStore
{
    private readonly _connection: S3;
    private readonly _bucket: string;
    private readonly _maxFileSize: number;


    public constructor(awsS3AccessKeyId: string, awsS3SecretAccessKey: string, awsS3Bucket: string)
    {
        given(awsS3AccessKeyId, "awsS3AccessKeyId").ensureHasValue().ensureIsString();
        given(awsS3SecretAccessKey, "awsS3SecretAccessKey").ensureHasValue().ensureIsString();
        given(awsS3Bucket, "awsS3Bucket").ensureHasValue().ensureIsString();

        this._connection = new S3({
            signatureVersion: "v4",
            region: "us-east-1",
            credentials: {
                accessKeyId: awsS3AccessKeyId,
                secretAccessKey: awsS3SecretAccessKey
            }
        });

        this._bucket = awsS3Bucket;
        this._maxFileSize = 1000000 * 1000;
    }


    public async store(fileName: string, fileData: Buffer): Promise<string>
    {
        given(fileName, "fileName").ensureHasValue().ensureIsString();
        given(fileData, "fileData").ensureHasValue().ensureIsType(Buffer).ensure(t => t.byteLength > 0);

        fileName = fileName.replaceAll(":", "-").trim();
        const fileSize = fileData.byteLength;
        if (fileSize > this._maxFileSize)
            throw new ArgumentException("fileData", "MAX file size of 1 GB exceeded");
        const fileMime = Mime.lookup(fileName) || "application/octet-stream";
        const id = `${Uuid.create().replaceAll("-", "").trim()}${Path.extname(fileName)}`;

        await this._connection.putObject({
            Bucket: this._bucket,
            Key: id,
            Body: fileData,
            ContentType: fileMime,
            ACL: "public-read",
        }).promise();

        return `https://s3.amazonaws.com/${this._bucket}/${id}`;
    }
}