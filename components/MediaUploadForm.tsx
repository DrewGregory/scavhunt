import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Progress,
  Spinner,
  Text,
  VStack,
  Box,
} from "@chakra-ui/react";
import { useState, useEffect, useRef } from "react";
import { submissionResponseBodySchema } from "../lib/types";
import Dashboard from '@uppy/react/dashboard';
import type { Body, Meta, UppyFile } from "@uppy/core";
import {
  PRODUCTION_UPLOAD_CONFIG,
  mergeUploadConfig,
  type UploadConfig,
} from "../lib/upload/config";
import { createUploader, type Uploader } from "../lib/upload/uppyConfig";

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

type FileStatus = "processing" | "uploading" | "uploaded" | "error";

type PreprocessInfo = {
  mode: "determinate" | "indeterminate";
  message?: string;
  value?: number;
};

const CONFIG_TIMEOUT_MS = 4000;
const POSTER_WAIT_MS = 10_000;

let configPromise: Promise<UploadConfig> | null = null;

function loadUploadConfig(): Promise<UploadConfig> {
  if (!configPromise) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
    configPromise = fetch("/api/upload-config", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => mergeUploadConfig(PRODUCTION_UPLOAD_CONFIG, data?.config))
      .catch(() => {
        configPromise = null;
        return PRODUCTION_UPLOAD_CONFIG;
      })
      .finally(() => clearTimeout(timer));
  }
  return configPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function finiteOrUndefined(n: number | null | undefined): number | undefined {
  return n != null && Number.isFinite(n) && n >= 0 ? n : undefined;
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
  const [uploader, setUploader] = useState<Uploader | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<FileStatus | null>(null);
  const [mediaURL, setMediaURL] = useState<string>("");
  const [preprocess, setPreprocess] = useState<PreprocessInfo | null>(null);
  const posterRef = useRef<Promise<string | null> | null>(null);
  const { challengeId } = formData;

  useEffect(() => {
    let cancelled = false;
    let created: Uploader | null = null;
    void loadUploadConfig().then((config) => {
      if (cancelled) return;
      created = createUploader({ config, challengeId, webcam: true });
      setUploader(created);
    });
    return () => {
      cancelled = true;
      created?.destroy();
      setUploader(null);
    };
  }, [challengeId]);

  useEffect(() => {
    if (!uploader) return;
    const { uppy } = uploader;

    const reset = () => {
      setFileId(null);
      setFileStatus(null);
      setMediaURL("");
      setPreprocess(null);
      posterRef.current = null;
    };
    const handleFileAdded = (file: UppyFile<Meta, Body>) => {
      reset();
      setFileId(file.id);
      setFileStatus("processing");
      setResult(null);
    };
    const handlePreprocessProgress = (
      file: UppyFile<Meta, Body> | undefined,
      progress: PreprocessInfo,
    ) => {
      if (file) setPreprocess(progress);
    };
    const handlePreprocessComplete = () => setPreprocess(null);
    const handleUploadStart = () => setFileStatus("uploading");
    const handleUploadSuccess = (
      file: UppyFile<Meta, Body> | undefined,
      response: { uploadURL?: string },
    ) => {
      if (!file) return;
      setMediaURL(response.uploadURL ?? file.uploadURL ?? "");
      setFileStatus("uploaded");
      posterRef.current = uploader.uploadPoster(file.id);
    };
    const handleUploadError = () => setFileStatus("error");

    uppy.on("file-added", handleFileAdded);
    uppy.on("file-removed", reset);
    uppy.on("preprocess-progress", handlePreprocessProgress);
    uppy.on("preprocess-complete", handlePreprocessComplete);
    uppy.on("upload-start", handleUploadStart);
    uppy.on("upload-success", handleUploadSuccess);
    uppy.on("upload-error", handleUploadError);

    return () => {
      uppy.off("file-added", handleFileAdded);
      uppy.off("file-removed", reset);
      uppy.off("preprocess-progress", handlePreprocessProgress);
      uppy.off("preprocess-complete", handlePreprocessComplete);
      uppy.off("upload-start", handleUploadStart);
      uppy.off("upload-success", handleUploadSuccess);
      uppy.off("upload-error", handleUploadError);
    };
  }, [uploader]);

  const mediaFields = async () => {
    if (!uploader || !fileId || !mediaURL) return {};
    const processed = uploader.compressor.getResult(fileId);
    const posterURL = posterRef.current
      ? await withTimeout(posterRef.current, POSTER_WAIT_MS, null)
      : null;
    if (!processed) return posterURL ? { posterURL } : {};
    const { compress, poster, originalFile } = processed;
    const info = compress.output;
    const width = info.width ?? poster?.width;
    const height = info.height ?? poster?.height;
    return {
      ...(posterURL ? { posterURL } : {}),
      durationSec: finiteOrUndefined(info.durationSec ?? poster?.durationSec),
      width: width != null ? Math.round(width) : undefined,
      height: height != null ? Math.round(height) : undefined,
      sizeBytes: compress.file.size,
      originalSizeBytes: originalFile.size,
      compressed: compress.compressed,
    };
  };

  const handleSubmit = async () => {
    if (!mediaURL && !skipUpload) {
      if (!fileId) {
        setResult({ success: false, message: "Please select a file to upload." });
      } else if (fileStatus === "error") {
        setResult({ success: false, message: "Upload failed. Retry the upload, or remove the file and try again." });
      } else {
        setResult({ success: false, message: "Upload still in progress. Please wait for it to finish." });
      }
      return;
    }

    if (showNoteField && noteRequired && !note.trim()) {
      setResult({ success: false, message: "Please provide a note." });
      return;
    }

    setIsSubmitting(true);
    setResult(null);
    try {
      const extra = await mediaFields();
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          ...(uploader && fileId ? { "x-attempt-id": uploader.attemptIdFor(fileId) } : {}),
        },
        body: JSON.stringify({
          mediaURL,
          skipUpload,
          note,
          ...extra,
          ...formData,
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

  const canSkipCompression =
    uploader != null &&
    fileId != null &&
    preprocess?.mode === "determinate" &&
    uploader.compressor.isCompressing(fileId);

  return (
      <VStack spacing={5} width="100%">
      
      <FormControl as="fieldset" width="100%">
        <FormLabel 
          as="legend" 
          fontWeight="semibold" 
          color="gray.700"
          mb={3}
        >
          Upload video
        </FormLabel>
        <Box 
          width="100%" 
          borderRadius="md"
          overflow="hidden"
          sx={{
            // ensure the dashboard never overflows on small screens
            ".uppy-Dashboard-inner": { maxWidth: "100%" },
            ".uppy-Dashboard-AddFiles": { flexDirection: ["column", "row"], gap: 3 },
            ".uppy-Dashboard-FileList": { maxWidth: "100%", width: "100%" },
            ".uppy-Dashboard-Item": { maxWidth: "100%" },
          }}
        >
          {uploader ? (
            <Dashboard
              uppy={uploader.uppy}
              proudlyDisplayPoweredByUppy={false}
              width="100%"
              doneButtonHandler={null}
            />
          ) : (
            <HStack justify="center" py={16} borderWidth="1px" borderRadius="md" borderStyle="dashed">
              <Spinner size="sm" color="gray.500" />
              <Text fontSize="sm" color="gray.600">Loading uploader…</Text>
            </HStack>
          )}
        </Box>
        {canSkipCompression && preprocess && (
          <Box mt={3} width="100%">
            <HStack justify="space-between" mb={1} spacing={3}>
              <Text fontSize="sm" color="gray.700">
                {preprocess.message ?? "Compressing"}… {Math.round((preprocess.value ?? 0) * 100)}%
              </Text>
              <Button
                size="xs"
                variant="outline"
                onClick={() => fileId && uploader?.compressor.skip(fileId)}
              >
                Skip compression
              </Button>
            </HStack>
            <Progress
              value={(preprocess.value ?? 0) * 100}
              size="xs"
              colorScheme="blue"
              borderRadius="full"
            />
          </Box>
        )}
      </FormControl>

      {showSkipUpload && (
        <FormControl as="fieldset" width="100%">
          <Checkbox
            isChecked={skipUpload}
            onChange={(e) => {
              setSkipUpload(e.target.checked);
            }}
            colorScheme="blue"
          >
            <Box as="span" fontSize="sm" color="gray.700">
              Skip upload (If having trouble, try again after submission, or send video to your point of contact)
            </Box>
          </Checkbox>
          {skipUploadHelperText && (
            <FormHelperText fontSize="sm" color="gray.600">
              {skipUploadHelperText}
            </FormHelperText>
          )}
        </FormControl>
      )}

      {showNoteField && (
        <FormControl as="fieldset" width="100%">
          <FormLabel 
            as="legend"
            fontWeight="semibold"
            color="gray.700"
            mb={2}
          >
            Add note
          </FormLabel>
          <Input
            type="text"
            onChange={(e) => setNote(e.target.value)}
            value={note}
            borderRadius="md"
            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px var(--chakra-colors-blue-400)" }}
          />
        </FormControl>
      )}

      {result && (
        <Alert 
          status={result.success ? "success" : "error"}
          borderRadius="md"
        >
          {result.message}
        </Alert>
      )}

      <Button 
        onClick={handleSubmit} 
        isLoading={isSubmitting} 
        width="100%"
        colorScheme="blue"
        size="lg"
        borderRadius="md"
        mt={2}
      >
        {buttonText}
      </Button>
    </VStack>
  );
}
