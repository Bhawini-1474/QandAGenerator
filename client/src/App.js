import React, {useState} from 'react';
import './App.css'; 
import UploadForm from './components/UploadForm';
import QuestionsAnswers from './components/QuestionsAnswers';

const App = () => {
  const [qaData, setQaData] = useState({ questions: [], answers: [] });
  const handleUpload = (data) => {
    setQaData({ questions: data.questions, answers: data.answers });
  };
  return (
    <div style={{ padding: '20px' }}>
        <h1>Quiz Question Generator</h1>
        <UploadForm onUpload={handleUpload} />
        {qaData.questions.length > 0 && (
            <QuestionsAnswers questions={qaData.questions} answers={qaData.answers} />
        )}
    </div>
);
};

export default App;
