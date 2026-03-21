import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import LoadingSpinner from '../components/LoadingSpinner';

const CATEGORIES = ['Lease', 'Insurance', 'Tax', 'Receipt', 'Inspection', 'Other'];

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Other');
  const [uploadPropertyId, setUploadPropertyId] = useState('');
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    try {
      const params = filterProperty ? `?property_id=${filterProperty}` : '';
      const res = await api.get(`/documents${params}`);
      setDocuments(res.data.documents || res.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filterProperty]);

  const loadProperties = useCallback(async () => {
    try {
      const res = await api.get('/properties');
      setProperties(Array.isArray(res.data) ? res.data : res.data.properties || []);
    } catch (err) { /* ignore */ }
  }, []);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', uploadCategory);
    if (uploadPropertyId) formData.append('property_id', uploadPropertyId);
    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      loadDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    uploadFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    uploadFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragover(true);
  };

  const handleDragLeave = () => setDragover(false);

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      loadDocuments();
    } catch (err) {
      setError('Failed to delete document');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  if (loading) return <LoadingSpinner size="large" message="Loading documents..." />;

  return (
    <div>
      <div className="page-header">
        <h1>Documents</h1>
      </div>

      <div className="filter-bar">
        <div className="form-group">
          <label>Filter by Property</label>
          <select value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Upload Category</label>
          <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Upload to Property</label>
          <select value={uploadPropertyId} onChange={(e) => setUploadPropertyId(e.target.value)}>
            <option value="">General (no property)</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="auth-error mb-16">{error}</div>}

      <div
        className={`upload-area ${dragover ? 'dragover' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="upload-area-icon">{uploading ? '\u231B' : '\u2191'}</div>
        <div className="upload-area-text">
          {uploading ? 'Uploading...' : <><span>Click to upload</span> or drag and drop</>}
        </div>
        <div className="upload-area-hint">PDF, DOC, JPG, PNG up to 10MB</div>
        <input ref={fileInputRef} type="file" onChange={handleFileSelect} />
      </div>

      {documents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\u22A1'}</div>
          <h3>No documents uploaded</h3>
          <p>Upload your first document using the area above.</p>
        </div>
      ) : (
        documents.map((doc) => (
          <div key={doc.id} className="doc-card">
            <div className="doc-card-info">
              <span className="doc-icon">{'\u{1F4C4}'}</span>
              <div className="doc-card-details">
                <h4>{doc.original_name || doc.filename}</h4>
                <p>
                  {doc.category || 'Uncategorized'}
                  {doc.property_name ? ` | ${doc.property_name}` : ''}
                  {doc.file_size ? ` | ${formatSize(doc.file_size)}` : ''}
                  {doc.created_at ? ` | ${new Date(doc.created_at).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>
            <div className="doc-card-actions">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => window.open(`/api/documents/${doc.id}/download`)}
              >
                Download
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(doc.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default Documents;
