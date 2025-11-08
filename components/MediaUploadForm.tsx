import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  VStack,
  Box,
} from "@chakra-ui/react";
import axios from "axios";
import { useState, useMemo } from "react";
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
  showNoteField?: boolean;
  initialNote?: string;
  noteRequired?: boolean;
  showSkipUpload?: boolean;
  skipUploadHelperText?: string;
}

export default function MediaUploadForm({
  apiEndpoint,
  buttonText,
  formData,
  onSuccess,
  showNoteField = false,
  initialNote = "",
  noteRequired = false,
  showSkipUpload = false,
  skipUploadHelperText = "",
}: MediaUploadFormProps) {
  const [note, setNote] = useState<string>(initialNote);
  const [skipUpload, setSkipUpload] = useState<boolean>(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { challengeId } = formData;

  const [uppy] = useState(() => new Uppy().use(Webcam, {
    modes:["video-audio"],
    mobileNativeCamera: true,
    showRecordingLength: true,
    showVideoSourceDropdown: true,
  }).use(AwsS3, {
    endpoint: apiEndpoint,
    limit: 1,
    getUploadParameters: async (file, options) => {
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
        headers: {
          'Content-Type': file.type,
        }
      }
    },
  }));

  const handleSubmit = async () => {
    if (!mediaURL && !skipUpload) {
      setResult({ success: false, message: "Please select a file to upload." });
      return;
    }

    if (showNoteField && noteRequired && !note.trim()) {
      setResult({ success: false, message: "Please provide a note." });
      return;
    }

    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          mediaURL,
          skipUpload,
          note,
          challengeId,
        })
      })
      const response = submissionResponseBodySchema.parse(await res.json());      
      if (response.status === "error") {
        const { message } = response;
        setResult({ success: false, message });
      } else {
        setNote("");
        setSkipUpload(false);
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

  const files = uppy.getFiles();
  const mediaURL = useMemo(() => {
    if (files.length === 0) {
      return "";
    }
    return files[0].uploadURL || "";
  }, [files]);
  return (
      <VStack spacing={4} width="100%">
      
      <FormControl as="fieldset" width="100%">
        <FormLabel as="legend">Upload video</FormLabel>
        <Box width="100%" sx={{
          // ensure the dashboard never overflows on small screens
          ".uppy-Dashboard-inner": { maxWidth: "100%" },
          ".uppy-Dashboard-AddFiles": { flexDirection: ["column", "row"], gap: 3 },
          ".uppy-Dashboard-FileList": { maxWidth: "100%", width: "100%" },
          ".uppy-Dashboard-Item": { maxWidth: "100%" },
        }}>
          <Dashboard
            uppy={uppy}
            proudlyDisplayPoweredByUppy={false}
            width="100%"
            doneButtonHandler={null}
          />
        </Box>
      </FormControl>

      {showSkipUpload && (
        <FormControl as="fieldset" width="100%">
          <Checkbox
            isChecked={skipUpload}
            onChange={(e) => {
              setSkipUpload(e.target.checked);
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
      )}

      <Button onClick={handleSubmit} isLoading={isSubmitting} width="100%">
        {buttonText}
      </Button>
    </VStack>
  );
}

