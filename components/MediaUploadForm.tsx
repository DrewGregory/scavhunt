import {
  VStack,
} from "@chakra-ui/react";
import axios from "axios";
import { useRef, useState } from "react";
import { submissionResponseBodySchema } from "../lib/types";
import Uppy from '@uppy/core';
import Dashboard from '@uppy/react/dashboard';
import Webcam from '@uppy/webcam';
import AwsS3 from '@uppy/aws-s3';

import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';
import '@uppy/webcam/css/style.min.css';

interface MediaUploadFormProps {
  apiEndpoint: string;
  formData: Record<string, string>;
  onSuccess?: () => void;
  buttonText?: string;
  acceptedFileTypes?: string;
  showNoteField?: boolean;
  initialNote?: string;
  noteRequired?: boolean;
  showSkipUpload?: boolean;
  skipUploadHelperText?: string;
}

export default function MediaUploadForm({
  apiEndpoint,
  formData,
  onSuccess,
  showNoteField = false,
  initialNote = "",
  noteRequired = false,
  showSkipUpload = false,
}: MediaUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string>(initialNote);
  const [skipUpload, setSkipUpload] = useState<boolean>(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uppy] = useState(() => new Uppy().use(Webcam).use(AwsS3, {
    endpoint: apiEndpoint,
    limit: 1,
    getUploadParameters: async (file, options) => {
      const { challengeId } = formData;
      const url = await axios.post("/api/presigned-url", {
        challengeId, 
        filename: file.name,
        fileType: file.type,
        contentType: file.type
      });
      const method: "PUT" = "PUT";
      return {
        method,
        url: url.data.url,
      }
    },
  }));

  const handleSubmit = async () => {
    if (!file && !skipUpload) {
      setResult({ success: false, message: "Please select a file to upload." });
      return;
    }

    if (showNoteField && noteRequired && !note.trim()) {
      setResult({ success: false, message: "Please provide a note." });
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    const formDataObj = new FormData();
    
    if (!skipUpload && file) {
      formDataObj.append("file", file);
    }
    
    if (showSkipUpload) {
      formDataObj.append("skipUpload", skipUpload ? "true" : "false");
    }
    
    if (showNoteField) {
      formDataObj.append("note", note);
    }
    
    // Add all additional form fields
    Object.entries(formData).forEach(([key, value]) => {
      formDataObj.append(key, value);
    });

    try {
      const result = await axios.post(apiEndpoint, formDataObj, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const response = submissionResponseBodySchema.parse(result.data);
      if (response.status === "error") {
        setResult({ success: false, message: response.message });
      } else {
        setFile(null);
        setNote("");
        setSkipUpload(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setResult({ success: true, message: response.message });
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err: unknown) {
      if (typeof err === "object" && err != null && "response" in err && err.response) {
        const { response } = err;
        if (typeof response === "object" && response != null && "data" in response && response.data) {
          const responseParse = submissionResponseBodySchema.safeParse(
            response.data
          );
          if (responseParse.success) {
            setResult({ success: false, message: responseParse.data.message });
            return;
          }
        }
      }
      setResult({
        success: false,
        message: `Upload failed. Error: ${
          typeof err === "object" && err != null && "message" in err ? err.message : "Unknown error - try again?"
        }`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
      <VStack spacing={4} width="100%">
      <Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} doneButtonHandler={() => {console.log(uppy.getFiles()[0].uploadURL)}}/>
      {/* <FormControl as="fieldset" width="100%">
        <FormLabel as="legend">Upload video</FormLabel>
        <Input
          type="file"
          accept={acceptedFileTypes}
          disabled={skipUpload}
          onChange={(e) => {
            const { files } = e.target;
            if (files != null && files.length === 1) {
              setFile(files[0]);
            }
          }}
          ref={fileInputRef}
        />
      </FormControl> */}

      {/* {showSkipUpload && (
        <FormControl as="fieldset" width="100%">
          <Checkbox
            isChecked={skipUpload}
            onChange={(e) => {
              setSkipUpload(e.target.checked);
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
          >
            Skip upload
          </Checkbox>
          {skipUploadHelperText && (
            <FormHelperText>
              {skipUploadHelperText}
            </FormHelperText>
          )}
        </FormControl>
      )}

      {showNoteField && (
        <FormControl as="fieldset" width="100%">
          <FormLabel as="legend">Add note</FormLabel>
          <Input
            type="text"
            onChange={(e) => setNote(e.target.value)}
            value={note}
          />
        </FormControl>
      )}

      {result && (
        <Alert status={result.success ? "success" : "error"}>
          {result.message}
        </Alert>
      )} */}

      {/* <Button onClick={handleSubmit} isLoading={isSubmitting} width="100%">
        {buttonText}
      </Button> */}
    </VStack>
  );
}

