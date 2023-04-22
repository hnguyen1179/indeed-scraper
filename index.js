require("dotenv").config({ path: __dirname + "/.env" });
const fs = require("fs");
const puppeteer = require("puppeteer");

const JOB_LISTINGS_URL =
  "https://www.indeed.com/jobs?q=frontend+engineer&l=New+York%2C+NY&from=searchOnHP&vjk=3471e5d39897e1d9";

const POSTING_CLICK_DELAY = Math.floor(Math.random() * 700) + 700;
const NEXT_PAGE_CLICK_DELAY = Math.floor(Math.random() * 1000) + 500;

// Main function
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0);

  await Promise.all([
    page.setViewport({ width: 1440, height: 1000 }),
    page.goto(JOB_LISTINGS_URL),
  ]);

  // Scrape
  console.log("Initate scraping");
  const [validPostings] = await scrapePostings(browser, page, textExtractor);

  console.log("validPostings: ", validPostings);

  const formattedPostings = validPostings.map((post) => {
    const { experienceMet, experienceRequired, company, title, location, url } =
      post;

    return `${experienceMet}\t${experienceRequired}\t${company}\t${title}\t${location}\t${url}`;
  });

  // Print Results
  fs.writeFile("./output.txt", formattedPostings.join("\n"), (e) => {
    if (e) return console.log(e);
    console.log("File successfully written");
  });
})();

// Filters job postings to exclude invalid job postings. Checks for years of experience required
function experienceFilter(description) {
  const pattern = new RegExp(
    /\d+\+ years|\d+ years|[1-9] to [1-9] years|[1-9]-[1-9] years|[1-9]-[1-9] \+ years|[1-9] \+ years|years of experience|yrs of experience/i
  );
  const yearsPattern = new RegExp(
    /(\d+)\+ years|(\d+) years|([1-9]) to [1-9] years|([1-9])-[1-9] years|([1-9])-[1-9] \+ years|([1-9]) \+ years|(\d+).+years/i
  );

  const metMinimum = !pattern.test(description);
  let minimumYears = 0;

  if (!metMinimum && description.match(yearsPattern) !== null) {
    const [yearsMin] = [...description.match(yearsPattern)].filter(
      (match) => match && match.length == 1
    );

    minimumYears = parseInt(yearsMin);
  }

  return [metMinimum, minimumYears];
}

// Extracts all the relevant information from a job posting
async function textExtractor() {
  console.log("In textExtractor");
  let company = document.querySelector(".css-1saizt3.e1wnkr790");
  if (company) company = company.innerText.trim();

  let location = document.querySelector(".css-6z8o9s.eu4oa1w0");
  if (location) location = location.innerText.trim();

  let title = document.querySelector(
    ".icl-u-xs-mb--xs.icl-u-xs-mt--none.jobsearch-JobInfoHeader-title.is-embedded span"
  );
  if (title) title = title.innerText.split("\n-")[0];

  const url = document.querySelector(`.vjs-highlight .jobTitle > a`).href;

  const description = document
    .querySelector("#jobDescriptionText")
    .innerText.replace(new RegExp(/\n+/g), " ");

  return [company, location, title, url, description];
}

// Grabs the unique posting ID of each job listing
function grabPostingsIDs() {
  console.log("In grabPostingsIDs");
  return [...document.querySelector(".jobsearch-ResultsList.css-0").children]
    .map(
      (li) =>
        li.children[0].className
          .split(" ")
          .filter((classname) => classname.includes("job"))[0]
    )
    .filter((jobID) => jobID !== undefined);
}

// Scrolls all the way down to the bottom of the page
function scrollToBottom() {
  const scrollDistance = document.querySelector(".jobsearch-LeftPane");
  window.scrollBy({ top: scrollDistance, behavior: "smooth" });
}

// Filters a given string to exclude senior roles
function titleFilter(title = "") {
  console.log("In titleFilter");
  // Includes
  const test1 = /front|ui|web|software/i.test(title);
  // Doesn't Include
  const test2 =
    !/senior|founding|head|staff|sr|lead|mid|angular|vue|iii|years|java[^s]|full/i.test(
      title
    );

  return [test1, test2].every((test) => test === true);
}

// Main scraping function that scrapes each posting for data
async function scrapePostings(browser, page, textExtractor) {
  console.log("In scrapePostings");
  const validPostings = [];

  try {
    let isNextPageAvailable = await page.evaluate(() => {
      return !!document.querySelector("a[data-testid='pagination-page-next']");
    });

    while (isNextPageAvailable) {
      console.log("In while loop");
      const postingsArray = await page.evaluate(grabPostingsIDs);

      await page.evaluate(scrollToBottom);
      await page.waitForTimeout(Math.random() * 800 + 1000);

      console.log(postingsArray);

      for (let jobID of postingsArray) {
        const jobTitle = await page.evaluate((id) => {
          return document.querySelector(`.${id} H2`).innerText;
        }, jobID);

        console.log("Looking at: ", jobTitle + ": " + jobID);

        // If it fails the job title checker (Senior role)
        if (!titleFilter(jobTitle)) {
          // Jump to the next iteration
          console.log("Skipping iteration");
          continue;
        }

        await Promise.all([
          page.click(`.${jobID} H2`),
          page.waitForSelector("#jobsearch-ViewjobPaneWrapper", {
            visible: true,
          }),
        ]);

        await page.waitForTimeout(POSTING_CLICK_DELAY);

        const [company, location, title, url, description] =
          await page.evaluate(textExtractor);

        validPostings.push({
          experienceMet: experienceFilter(description)[0] ? "yes" : "no",
          experienceRequired: experienceFilter(description)[1],
          company,
          title,
          location,
          url,
        });

        await page.waitForTimeout(POSTING_CLICK_DELAY);
      }

      // Click to the next page
      await Promise.all([
        page.click("a[data-testid='pagination-page-next']"),
        page.waitForNavigation(),
        page.waitForTimeout(NEXT_PAGE_CLICK_DELAY),
      ]);

      // Reassign this boolean for the next iteration
      isNextPageAvailable = await page.evaluate(() => {
        return !!document.querySelector(
          "a[data-testid='pagination-page-next']"
        );
      });
    }
  } catch (e) {
    console.log(e);
  }

  return [validPostings];
}
