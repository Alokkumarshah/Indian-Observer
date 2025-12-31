const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const News = require('../src/models/News');
const User = require('../src/models/User');

dotenv.config();

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI env variable');
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('Mongo connection error:', error.message);
    throw error;
  }
};

const generateDummyUsers = async () => {
  const users = [
    {
      name: 'John Doe',
      email: 'john.doe@example.com',
      password: 'password123',
      role: 'admin',
    },
    {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      password: 'password123',
      role: 'user',
    },
    {
      name: 'Bob Johnson',
      email: 'bob.johnson@example.com',
      password: 'password123',
      role: 'user',
    },
    {
      name: 'Alice Williams',
      email: 'alice.williams@example.com',
      password: 'password123',
      role: 'user',
    },
  ];

  const createdUsers = [];
  for (const userData of users) {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      console.log(`User ${userData.email} already exists, skipping...`);
      createdUsers.push(existingUser);
    } else {
      const user = new User(userData);
      await user.save();
      console.log(`Created user: ${userData.email}`);
      createdUsers.push(user);
    }
  }

  return createdUsers;
};

const generateDummyNews = async (users) => {
  const topics = [
    'Technology Innovation',
    'Climate Change',
    'Economic Growth',
    'Healthcare Advances',
    'Space Exploration',
    'Artificial Intelligence',
    'Renewable Energy',
    'Global Politics',
    'Sports Events',
    'Entertainment Industry',
  ];

  const categories = ['Technology', 'Environment', 'Economy', 'Health', 'Science', 'Politics', 'Sports', 'Entertainment', 'General'];

  const sampleTitles = [
    'Breakthrough in Quantum Computing Achieves New Milestone',
    'Global Climate Summit Reaches Historic Agreement',
    'Stock Markets Reach All-Time High Amid Economic Recovery',
    'New Cancer Treatment Shows Promising Results in Clinical Trials',
    'Mars Mission Successfully Lands Rover on Red Planet',
    'AI Technology Transforms Healthcare Diagnostics',
    'Solar Energy Costs Drop to Record Low',
    'International Trade Deal Signed Between Major Economies',
    'Olympic Games Break Viewership Records',
    'Streaming Platform Launches Original Content Series',
  ];

  const sampleSummaries = [
    'Scientists have achieved a major breakthrough in quantum computing, potentially revolutionizing data processing and encryption.',
    'World leaders have reached a consensus on climate action, setting ambitious targets for carbon reduction.',
    'Financial markets have shown remarkable resilience, with indices reaching unprecedented levels.',
    'Medical researchers report significant progress in cancer treatment, offering hope to millions of patients.',
    'Space exploration reaches new heights as a mission successfully lands on Mars, opening possibilities for future colonization.',
    'Artificial intelligence is making significant strides in medical diagnosis, improving accuracy and speed.',
    'Renewable energy becomes more accessible as solar power costs continue to decline globally.',
    'A landmark trade agreement promises to boost economic cooperation between participating nations.',
    'The latest Olympic Games have captivated audiences worldwide, setting new records for viewership.',
    'A major streaming service has unveiled its latest original programming, attracting millions of subscribers.',
  ];

  const sampleContent = [
    'In a groundbreaking development, researchers have successfully demonstrated quantum supremacy in a controlled laboratory environment. This achievement marks a significant milestone in the field of quantum computing, with potential applications ranging from cryptography to drug discovery. The technology could revolutionize how we process information and solve complex problems that are currently beyond the reach of classical computers.',
    'After days of intense negotiations, delegates from over 190 countries have agreed on a comprehensive climate action plan. The agreement includes commitments to reduce greenhouse gas emissions, invest in renewable energy infrastructure, and support developing nations in their transition to sustainable practices. Environmental experts have praised the deal as a crucial step forward in the global fight against climate change.',
    'Financial analysts are celebrating a remarkable period of economic growth, with stock markets around the world reaching new heights. The surge is attributed to strong corporate earnings, favorable monetary policies, and increasing investor confidence. Economists suggest this trend reflects a robust recovery from previous economic challenges, though they caution about potential market volatility ahead.',
    'A new cancer treatment protocol has shown exceptional results in recent clinical trials, with patients experiencing significant improvements in survival rates. The therapy combines traditional chemotherapy with innovative immunotherapy techniques, targeting cancer cells more effectively while minimizing side effects. Medical professionals are optimistic about the treatment\'s potential to transform cancer care.',
    'The successful landing of a rover on Mars represents a major achievement in space exploration. The mission aims to collect samples, study the planet\'s geology, and search for signs of past or present life. This accomplishment brings humanity one step closer to potential future missions, including crewed expeditions to the Red Planet.',
  ];

  const newsArticles = [];

  for (let i = 0; i < 20; i++) {
    const topic = topics[i % topics.length];
    const category = categories[i % categories.length];
    const title = sampleTitles[i % sampleTitles.length];
    const summary = sampleSummaries[i % sampleSummaries.length];
    const content = sampleContent[i % sampleContent.length];
    const randomUser = users[Math.floor(Math.random() * users.length)];

    const isPublished = i < 12;
    const isTrending = i < 8;
    const publishedDate = isPublished
      ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      : null;

    const tags = [
      category.toLowerCase(),
      topic.split(' ')[0].toLowerCase(),
      'news',
      'update',
      'breaking',
    ].slice(0, Math.floor(Math.random() * 3) + 2);

    const sourceOptions = [
      {
        source: 'Reuters',
        title: title,
        snippet: summary,
        link: `https://reuters.com/article/${i}`,
        imageUrl: `https://via.placeholder.com/800x400?text=${encodeURIComponent(topic)}`,
        publishedAt: publishedDate ? publishedDate.toISOString() : new Date().toISOString(),
      },
      {
        source: 'BBC News',
        title: title,
        snippet: summary,
        link: `https://bbc.com/news/${i}`,
        imageUrl: `https://via.placeholder.com/800x400?text=${encodeURIComponent(topic)}`,
        publishedAt: publishedDate ? publishedDate.toISOString() : new Date().toISOString(),
      },
      {
        source: 'The Guardian',
        title: title,
        snippet: summary,
        link: `https://theguardian.com/world/${i}`,
        imageUrl: `https://via.placeholder.com/800x400?text=${encodeURIComponent(topic)}`,
        publishedAt: publishedDate ? publishedDate.toISOString() : new Date().toISOString(),
      },
    ];

    const comments = [];
    if (isPublished && Math.random() > 0.5) {
      const numComments = Math.floor(Math.random() * 4) + 1;
      for (let j = 0; j < numComments; j++) {
        const commentUser = users[Math.floor(Math.random() * users.length)];
        const commentTexts = [
          'Great article! Very informative.',
          'This is an important development.',
          'I have some concerns about this.',
          'Thanks for sharing this news.',
          'Looking forward to more updates on this topic.',
        ];
        comments.push({
          user: commentUser._id,
          text: commentTexts[j % commentTexts.length],
        });
      }
    }

    const newsData = {
      topic: `${topic} - Article ${i + 1}`,
      title: title,
      summary: summary,
      content: content,
      category: category,
      tags: tags,
      interestOverTime: {
        '2024-01-01': Math.floor(Math.random() * 100),
        '2024-01-02': Math.floor(Math.random() * 100),
        '2024-01-03': Math.floor(Math.random() * 100),
      },
      availableSources: ['Reuters', 'BBC News', 'The Guardian', 'CNN', 'Al Jazeera'],
      sourceOptions: sourceOptions,
      selectedSource: sourceOptions[0].source,
      primarySource: sourceOptions[0].source,
      primaryLink: sourceOptions[0].link,
      imageUrl: sourceOptions[0].imageUrl,
      externalUrl: sourceOptions[0].link,
      status: isPublished ? 'published' : 'draft',
      publishedAt: publishedDate,
      isTrending: isTrending,
      autoGenerated: Math.random() > 0.3,
      fromNewsApi: Math.random() > 0.5,
      createdBy: randomUser._id,
      comments: comments,
      generatedAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
    };

    newsArticles.push(newsData);
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const newsData of newsArticles) {
    try {
      const existingNews = await News.findOne({ topic: newsData.topic });
      if (existingNews) {
        console.log(`News article "${newsData.topic}" already exists, skipping...`);
        skippedCount++;
        continue;
      }

      const news = new News(newsData);
      await news.save();
      console.log(`Created news article: ${newsData.title}`);
      createdCount++;
    } catch (error) {
      console.error(`Error creating news article "${newsData.topic}":`, error.message);
    }
  }

  return { createdCount, skippedCount };
};

const seedDatabase = async () => {
  try {
    await connectDB();

    console.log('\n=== Starting Database Seeding ===\n');

    console.log('Step 1: Creating dummy users...');
    const users = await generateDummyUsers();
    console.log(`Created/found ${users.length} users\n`);

    console.log('Step 2: Creating dummy news articles...');
    const newsResult = await generateDummyNews(users);
    console.log(`Created ${newsResult.createdCount} news articles, skipped ${newsResult.skippedCount} existing articles\n`);

    console.log('=== Database Seeding Completed Successfully ===\n');
    console.log('Summary:');
    console.log(`- Users: ${users.length}`);
    console.log(`- News Articles: ${newsResult.createdCount} created, ${newsResult.skippedCount} skipped`);

    await mongoose.connection.close();
    console.log('\nDatabase connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedDatabase();

