import React from 'react';

const QuestionsAnswers = ({ questions, answers}) =>{
    return (
        <div className='ques-ans'>
            <h2>Quiz Questions</h2>
            <ol>
                {answers.map((qaPair, index)=>  (
                  <li key={index}>
                  <strong>Question:</strong> {qaPair.question}
                   <br />
                  <strong>Answer:</strong> {qaPair.answer || 'No answer available'}
                  </li>
                ))}
                
            </ol>
        </div>
    );
};

export default QuestionsAnswers;
