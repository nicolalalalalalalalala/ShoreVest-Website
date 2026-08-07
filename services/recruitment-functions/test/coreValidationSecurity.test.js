'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  validSingleLineText,
  validMultilineText,
  validLinkedInUrl,
  validOriginalFileName,
  candidate,
  fileMeta
} = require('../../../api/recruitment/core/validation');
const { ERROR_CODES } = require('../../../api/recruitment/core/constants');

const cv = {
  maxSizeBytes: 10 * 1024 * 1024,
  allowedExtensions: ['.pdf', '.docx'],
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
};

function candidateInput(linkedinUrl = '') {
  return {
    fullName: 'Candidate Name',
    email: 'candidate@example.com',
    telephone: '',
    currentLocation: '',
    linkedinUrl,
    coverNote: ''
  };
}

test('LinkedIn validation requires an HTTPS LinkedIn hostname', () => {
  assert.equal(validLinkedInUrl(''), true);
  assert.equal(validLinkedInUrl('https://linkedin.com/in/example'), true);
  assert.equal(validLinkedInUrl('https://www.linkedin.com/in/example'), true);
  assert.equal(validLinkedInUrl('https://hk.linkedin.com/in/example'), true);
  assert.equal(validLinkedInUrl('http://www.linkedin.com/in/example'), false);
  assert.equal(validLinkedInUrl('https://evil.example/?linkedin.com'), false);
  assert.equal(validLinkedInUrl('https://linkedin.com.evil.example/in/example'), false);
  assert.equal(validLinkedInUrl('https://user:password@linkedin.com/in/example'), false);
  assert.equal(validLinkedInUrl('not-a-url'), false);
});

test('candidate validation rejects lookalike LinkedIn links', () => {
  const result = candidate(
    candidateInput('https://evil.example/?next=linkedin.com'),
    true
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, ERROR_CODES.VALIDATION_FAILED);
  assert.deepEqual(result.fields, ['linkedinUrl']);
});

test('single-line candidate fields reject CRLF, controls and bidi overrides', () => {
  assert.equal(validSingleLineText('Candidate Name', 200, true), true);
  assert.equal(validSingleLineText('Candidate\nBcc: attacker@example.com', 200, true), false);
  assert.equal(validSingleLineText('Candidate\rName', 200, true), false);
  assert.equal(validSingleLineText('Candidate\u0000Name', 200, true), false);
  assert.equal(validSingleLineText('Candidate\u202eName', 200, true), false);
  assert.equal(validSingleLineText('   ', 200, true), false);
});

test('cover notes allow ordinary line breaks and tabs but reject hidden controls and bidi text', () => {
  assert.equal(validMultilineText('Line one\nLine two\r\n\tIndented', 4000), true);
  assert.equal(validMultilineText('Visible\u0000Hidden', 4000), false);
  assert.equal(validMultilineText('Visible\u000bHidden', 4000), false);
  assert.equal(validMultilineText('Visible\u202eHidden', 4000), false);
});

test('candidate validation blocks subject/header injection and hidden text', () => {
  const cases = [
    ['fullName', 'Candidate\nBcc: attacker@example.com'],
    ['telephone', '+1 212 555 0100\rInjected'],
    ['currentLocation', 'New York\u202eHidden'],
    ['coverNote', 'Normal note\u0000Hidden']
  ];

  for (const [field, value] of cases) {
    const input = candidateInput();
    input[field] = value;
    const result = candidate(input, true);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, ERROR_CODES.VALIDATION_FAILED);
    assert.ok(result.fields.includes(field));
  }
});

test('candidate validation preserves legitimate international and multiline content', () => {
  const input = candidateInput('https://www.linkedin.com/in/example');
  input.fullName = '张伟';
  input.currentLocation = '上海，中国';
  input.coverNote = '第一行\nSecond line\n\tIndented detail';
  const result = candidate(input, true);
  assert.equal(result.ok, true);
  assert.equal(result.candidate.fullName, '张伟');
  assert.ok(result.candidate.coverNote.includes('\n'));
});

test('original filename validation rejects paths, controls and bidi overrides', () => {
  assert.equal(validOriginalFileName('candidate-cv.pdf'), true);
  assert.equal(validOriginalFileName('../candidate-cv.pdf'), false);
  assert.equal(validOriginalFileName('folder/candidate-cv.pdf'), false);
  assert.equal(validOriginalFileName('candidate\u0000-cv.pdf'), false);
  assert.equal(validOriginalFileName('candidate\n-cv.pdf'), false);
  assert.equal(validOriginalFileName('candidate\u202e-fdp.exe'), false);
});

test('file metadata rejects unsafe original filenames before extension handling', () => {
  for (const originalName of [
    'candidate\u0000-cv.pdf',
    'candidate\n-cv.pdf',
    'candidate\u202e-fdp.exe'
  ]) {
    const result = fileMeta({
      originalName,
      declaredMimeType: 'application/pdf',
      sizeBytes: 1024
    }, cv);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, ERROR_CODES.VALIDATION_FAILED);
  }
});
