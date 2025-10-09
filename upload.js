const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Ensure upload directories exist
const ensureDirectoryExists = async (dir) => {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
};

// Storage configuration
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        let uploadPath = 'backend/uploads/';
        
        // Organize by file type and user
        if (file.fieldname === 'avatar') {
            uploadPath += 'avatars/';
        } else if (file.fieldname === 'serviceImages') {
            uploadPath += 'services/';
        } else if (file.fieldname === 'portfolio') {
            uploadPath += 'portfolio/';
        } else if (file.fieldname === 'documents') {
            uploadPath += 'documents/';
        } else if (file.fieldname === 'deliverables') {
            uploadPath += 'deliverables/';
        } else {
            uploadPath += 'misc/';
        }
        
        await ensureDirectoryExists(uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, extension);
        const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, `${sanitizedBaseName}_${uniqueSuffix}${extension}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        video: ['video/mp4', 'video/mpeg', 'video/quicktime'],
        document: [
            'application/pdf', 
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ]
    };
    
    const allAllowedTypes = [...allowedTypes.image, ...allowedTypes.video, ...allowedTypes.document];
    
    if (allAllowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
};

// Multer configuration
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 10 // Maximum 10 files per request
    }
});

// Error handling middleware
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size allowed is 50MB.'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 10 files allowed.'
            });
        }
    }
    
    if (err.message.includes('File type')) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    
    next(err);
};

// Upload configurations for different use cases
const uploadConfigs = {
    avatar: upload.single('avatar'),
    serviceImages: upload.array('serviceImages', 5),
    portfolio: upload.array('portfolio', 10),
    documents: upload.array('documents', 5),
    deliverables: upload.array('deliverables', 10),
    mixed: upload.fields([
        { name: 'images', maxCount: 5 },
        { name: 'documents', maxCount: 5 },
        { name: 'videos', maxCount: 2 }
    ])
};

module.exports = {
    upload,
    uploadConfigs,
    handleUploadError
};
