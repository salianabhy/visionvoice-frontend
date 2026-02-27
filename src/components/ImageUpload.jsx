// ImageUpload.jsx
// Handles drag-and-drop and click-to-upload image functionality.
// Shows a preview of the uploaded image and a "Describe Image" button.

import { useState, useRef, useCallback } from "react";

export default function ImageUpload({ onDescribe, isLoading }) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  // Process a selected or dropped file
  const handleFile = useCallback((selectedFile) => {
    if (!selectedFile || !selectedFile.type.startsWith("image/")) {
      alert("Please upload a valid image file (JPG, PNG, WEBP, etc.)");
      return;
    }
    setFile(selectedFile);
    // Create a local URL for previewing the image
    const previewURL = URL.createObjectURL(selectedFile);
    setPreview(previewURL);
  }, []);

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    handleFile(dropped);
  };

  // Click to open file picker
  const handleClick = () => fileInputRef.current?.click();
  const handleInputChange = (e) => handleFile(e.target.files[0]);

  // Send file to parent component (App.jsx) for API call
  const handleSubmit = () => {
    if (file) onDescribe(file);
  };

  // Reset to upload another image
  const handleReset = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="upload-section">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        style={{ display: "none" }}
        aria-label="Upload image file"
      />

      {/* Drag and Drop Zone */}
      {!preview ? (
        <div
          className={`dropzone ${dragOver ? "drag-over" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          role="button"
          tabIndex={0}
          aria-label="Click or drag and drop an image to upload"
          onKeyDown={(e) => e.key === "Enter" && handleClick()}
        >
          <div className="dropzone-icon">🖼️</div>
          <p className="dropzone-text">Drag & drop your image here</p>
          <p className="dropzone-subtext">or click to browse files</p>
          <p className="dropzone-formats">Supports: JPG, PNG, WEBP, GIF</p>
        </div>
      ) : (
        /* Image Preview */
        <div className="preview-container">
          <img
            src={preview}
            alt="Uploaded preview"
            className="image-preview"
          />
          <button
            className="btn btn-secondary reset-btn"
            onClick={handleReset}
            aria-label="Remove image and upload a different one"
          >
            ✕ Remove Image
          </button>
        </div>
      )}

      {/* Describe Button */}
      {preview && (
        <button
          className={`btn btn-primary describe-btn ${isLoading ? "loading" : ""}`}
          onClick={handleSubmit}
          disabled={isLoading || !file}
          aria-label="Generate AI description of the uploaded image"
        >
          {isLoading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Analyzing Image...
            </>
          ) : (
            <>🔍 Describe Image</>
          )}
        </button>
      )}
    </div>
  );
}
