const CmsGeneratedDocument = require('../../models/cms/CmsGeneratedDocument')
const CmsCandidate = require('../../models/cms/CmsCandidate')

// @desc    Get all generated documents for a specific candidate
// @route   GET /api/cms/candidates/:id/generated-documents
// @access  Private (Admin/Manager/CandidateAdmin)
exports.getDocuments = async (req, res) => {
  try {
    const candidateId = req.params.id
    
    // Ensure candidate exists
    const candidate = await CmsCandidate.findById(candidateId)
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' })
    }

    const documents = await CmsGeneratedDocument.find({ candidateId }).sort({ createdAt: -1 })
    res.status(200).json(documents)
  } catch (error) {
    console.error('Error fetching generated documents:', error)
    res.status(500).json({ message: 'Server error fetching documents' })
  }
}

// @desc    Create a new generated document for a specific candidate
// @route   POST /api/cms/candidates/:id/generated-documents
// @access  Private (Admin/Manager/CandidateAdmin)
exports.createDocument = async (req, res) => {
  try {
    const candidateId = req.params.id
    const { documentType, data } = req.body

    if (!documentType) {
      return res.status(400).json({ message: 'Document type is required' })
    }

    // Ensure candidate exists
    const candidate = await CmsCandidate.findById(candidateId)
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' })
    }

    const newDoc = new CmsGeneratedDocument({
      candidateId,
      documentType,
      data: data || {},
      createdBy: req.user ? req.user._id : null
    })

    await newDoc.save()
    res.status(201).json(newDoc)
  } catch (error) {
    console.error('Error creating generated document:', error)
    res.status(500).json({ message: 'Server error creating document' })
  }
}

// @desc    Delete a generated document
// @route   DELETE /api/cms/candidates/:id/generated-documents/:docId
// @access  Private (Admin/Manager/CandidateAdmin)
exports.deleteDocument = async (req, res) => {
  try {
    const { id: candidateId, docId } = req.params

    const document = await CmsGeneratedDocument.findOne({ _id: docId, candidateId })
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' })
    }

    await document.deleteOne()
    res.status(200).json({ message: 'Document deleted successfully' })
  } catch (error) {
    console.error('Error deleting generated document:', error)
    res.status(500).json({ message: 'Server error deleting document' })
  }
}

// @desc    Update a generated document
// @route   PUT /api/cms/candidates/:id/generated-documents/:docId
// @access  Private (Admin/Manager/CandidateAdmin)
exports.updateDocument = async (req, res) => {
  try {
    const { id: candidateId, docId } = req.params
    const { data } = req.body

    const document = await CmsGeneratedDocument.findOne({ _id: docId, candidateId })
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' })
    }

    if (data) {
      document.data = data
      await document.save()
    }

    res.status(200).json(document)
  } catch (error) {
    console.error('Error updating generated document:', error)
    res.status(500).json({ message: 'Server error updating document' })
  }
}
