import fs from "fs";
import { IncomingForm, File, Fields, Files } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";
import { SubmissionModel } from "../../models/Submission";
import { Types } from "mongoose";
import assert from "assert";
import { dbConnect } from "../../lib/dbConnect";
import { SubmissionResponseBody } from "../../lib/types";
import { ADMIN_TEAM_ID, getTeamFromCookie } from "../../lib/team";
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
  submissionId: string;
  teamId: string;
  note?: string;
}> => {
  const team = await getTeamFromCookie(cookies);
  if (team == null) {
    return {
      status: "error",
      message: `Team with team code not found`,
    };
  }
  const teamId = team._id.toHexString();
  
  if (
    fields.submissionId == null ||
    fields.submissionId.length === 0
  ) {
    return {
      status: "error",
      message: "Please provide submissionId",
    };
  }
  const submissionId = fields.submissionId[0];
  
  const submission = await SubmissionModel.findOne({
    _id: new Types.ObjectId(submissionId),
  })
    .lean()
    .exec();
  
  if (submission == null || Array.isArray(submission)) {
    return {
      status: "error",
      message: `Submission with id '${submissionId}' not found`,
    };
  }

  // Check if the user is admin OR the original submitter
  const isAdmin = teamId === ADMIN_TEAM_ID;
  const isOriginalSubmitter = submission.teamId.toString() === teamId;
  
  if (!isAdmin && !isOriginalSubmitter) {
    return {
      status: "error",
      message: "You don't have permission to update this submission",
    };
  }
  
  // Get note if provided
  const note = fields.note && fields.note.length > 0 ? fields.note[0] : undefined;
  
  return {
    status: "success",
    submissionId,
    teamId,
    note,
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

  const { submissionId, teamId, note } = formValidation;

  // Check if we have either a file or a note update
  const hasFile = files.file != null && files.file.length > 0;
  
  if (!hasFile && !note) {
    return respond(400, {
      status: "error",
      message: "Please provide either a file or a note to update",
    });
  }

  let mediaURL: string | undefined = undefined;

  // Validate and upload file if provided
  if (hasFile) {
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
  
  // Get the submission to get challengeId for the key
  const submission = await SubmissionModel.findOne({
    _id: new Types.ObjectId(submissionId),
  }).lean().exec();
  
  if (submission == null || Array.isArray(submission)) {
    return respond(400, {
      status: "error",
      message: "Submission not found",
    });
  }

    const challengeId = submission.challengeId.toString();
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
        message: "Failed to upload file. Try again.",
      });
    }
  }

  // Build update object
  const updateFields: { mediaURL?: string; note?: string } = {};
  if (mediaURL) {
    updateFields.mediaURL = mediaURL;
  }
  if (note !== undefined) {
    updateFields.note = note;
  }

  // Update the submission
  await SubmissionModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(submissionId),
    },
    updateFields
  ).exec();
  
  return respond(200, {
    status: "success",
    submissionId: submissionId,
    message: mediaURL && note ? "Video and note updated successfully" : 
             mediaURL ? "Video uploaded successfully" : 
             "Note updated successfully",
  });

};

