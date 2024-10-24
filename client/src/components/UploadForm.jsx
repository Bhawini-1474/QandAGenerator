import React, {useState} from 'react';
import axios from 'axios';

const UploadForm = ({ onUpload }) =>{
   const[file, setFile] = useState(null);
   const[loading, setLoading] = useState(null);
   const[error, setError] = useState(null);

   const handleChange = (event) => {
    setFile(event.target.files[0]);
   };
   
   const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await axios.post('http://localhost:5000/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        onUpload(response.data);
    } catch (err) {
        console.error(err);
        setError('Error uploading file. Please try again.');
    } finally {
        setLoading(false);
    }
};

return (
    <form onSubmit={handleSubmit}>
        <input type="file" accept=".pdf" onChange={handleChange} required />
        <button type="submit" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload PDF'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
);

};

export default UploadForm;