import fs from "fs";
import { IncomingForm, File, Fields, Files } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";
import { SubmissionModel } from "../../models/Submission";
import { ChallengeModel } from "../../models/Challenge";
import { Types } from "mongoose";
import assert from "assert";
import { dbConnect } from "../../lib/dbConnect";
import { SubmissionResponseBody } from "../../lib/types";
import { getTeamFromCookie } from "../../lib/team";
import { PutObjectAclCommand, PutObjectCommand, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { NextApiRequestCookies } from "next/dist/server/api-utils";
import { randomBytes } from "crypto";

// Handle file upload
export const config = {
  api: {
    bodyParser: false,
  },
};

const uploadSubmission = async ({
  bucket,
  file,
  key,
  mimetype,
} : {
  bucket: string;
  file: File;
  key: string;
  mimetype: string;
}) => {
  const fileStream = fs.createReadStream(file.filepath);
  assert(process.env.SPACES_KEY != null);
  assert(process.env.SPACES_SECRET != null);
  assert(process.env.SPACES_REGION != null);
  assert(process.env.SPACES_ENDPOINT != null);
  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: mimetype,
  };

  const client = new S3Client({
    credentials: {
      accessKeyId: process.env.SPACES_KEY,
      secretAccessKey: process.env.SPACES_SECRET,
    },
    region: process.env.SPACES_REGION,
    endpoint: process.env.SPACES_ENDPOINT,
    forcePathStyle: false,
  });

  await client.send(new PutObjectCommand(params));
  await client.send(new PutObjectAclCommand({
    Bucket: bucket,
    Key: key,
    ACL: "public-read",
  }));
};



const validateForm = async ({
  cookies,
  fields,
} : {
  cookies: NextApiRequestCookies;
  fields: Fields;
}) : Promise<{ status: "error", message: string } | {
  status: "success",
  note: string;
  teamId: string;
  challengeId: string;
}> => {
  if (fields.note == null || fields.note.length === 0 || fields.note[0] === "") {
    return {
      status: "error",
      message: "Please provide a note",
    };
  }
  const note = fields.note[0]

  const team = await getTeamFromCookie(cookies);
  if (team == null) {
    return {
      status: "error",
      message: `Team with team code not found`,
    };
  }
  const teamId = team._id.toHexString();
  if (
    fields.challengeId == null ||
    fields.challengeId.length === 0
  ) {
    return {
      status: "error",
      message: "Please provide challengeId",
    };
  }
  const challengeId = fields.challengeId[0];
  const challenge = await ChallengeModel.findOne({
    _id: new Types.ObjectId(challengeId),
  })
    .lean()
    .exec();
  if (challenge == null) {
    return {
      status: "error",
      message: `Challenge with id '${challengeId}' not found`,
    };
  }
  
  return {
    status: "success",
    note,
    teamId,
    challengeId,
  };
}


const validateFile = ({
  files,
} : {
  files: Files;
}) : { status: "error", message: string} | { file: File; mimetype: NonNullable<File["mimetype"]>; status: "success" } => {
  if (files.file == null || files.file.length === 0) {
    return {
      status: "error",
      message: "Please provide a file",
    }
  }

  const file = files.file[0];
  if (file.mimetype == null) {
    return {
      status: "error",
      message: "Invalid file, missing mimetype",
    };
  }

  return {
    status: "success",
    file,
    mimetype: file.mimetype,
  }
}


export default async (req: NextApiRequest, res: NextApiResponse) => {
  const form = new IncomingForm({
    maxFileSize: 500 * 1024 * 1024,
    maxTotalFileSize: 500 * 1024 * 1024, // 500mb
  });

  // Promisify form parsing
  const formParse = (req: NextApiRequest): Promise<{ fields: Fields; files: Files }> => {
    return new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });
  }

  const { fields, files } = await formParse(req);
  await dbConnect();

  const respond = (status: number, body: SubmissionResponseBody) => {
    res.status(status).json(body);
  }

  const formValidation = await validateForm({
    fields,
    cookies: req.cookies,
  });

  if (formValidation.status === "error") {
    const { status, message } = formValidation; 
    return respond(400, {
      status, message,
    });
  }

  const { challengeId, note, teamId } = formValidation;

  // Assumes only one file is uploaded. Adjust if multiple files are expected.
  const skipUpload = fields.skipUpload != null && fields.skipUpload[0] === "true";
  let mediaURL : string | null = null;
  if (!skipUpload) {
    const fileValidation = validateFile({
      files,
    })
    if (fileValidation.status === "error") {
      const { status, message } = fileValidation;
      return respond(400, {
        status, message,
      });
    }
    const { file, mimetype } = fileValidation;
    const bucket = process.env.SPACES_BUCKET_NAME;
    assert(bucket != null);
    const spacesRegion = process.env.SPACES_REGION;
    assert(spacesRegion != null);
    const fileType = file.originalFilename?.split(".").pop() ?? "'''";
    const key = `${challengeId}/${teamId}/${randomBytes(8).toString("hex")}.${fileType}`;
    mediaURL = `https://${bucket}.${spacesRegion}.cdn.digitaloceanspaces.com/${key}`;
    try {
      await uploadSubmission({
        file,
        mimetype,
        bucket,
        key,
      });
    } catch (error: unknown) {
      console.error(error);
      return respond(400, {
        status: "error",
        message: "Failed to upload file. Try again or skip upload and send us the file elsewhere",
      });
    }
  }

  const submission = await SubmissionModel.create({
    teamId,
    challengeId,
    accepted: false,
    mediaURL,
    note,
    createdAt: new Date(),
  });
  return respond(200, {
    status: "success",
    submissionId: submission._id.toHexString(),
    message: "Submission uploaded successfully",
  });

};

