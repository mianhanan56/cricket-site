// Current ICC player rankings across all three formats (sourced from the
// official ICC rankings; men as of 23 Jun 2026, women as of 18 May 2026).
// `rating` is the ICC rating number; `points` mirrors it for display.
// Shared by the full DB seed and the standalone `seed:rankings` refresh.
//
// NOTE: the ICC does not publish Women's Test rankings (women play almost no
// Tests), so that combination is intentionally absent.

type RankRow = { playerName: string; country: string; rating: number };
type Format = 'TEST' | 'ODI' | 'T20I';
type Role = 'BATTING' | 'BOWLING' | 'ALLROUNDER';
type Gender = 'MEN' | 'WOMEN';

type RoleMap = Record<Role, RankRow[]>;
type GenderMap = Partial<Record<Gender, RoleMap>>;

const RANKINGS: Record<Format, GenderMap> = {
  TEST: {
    MEN: {
      BATTING: [
        { playerName: 'Travis Head', country: 'Australia', rating: 853 },
        { playerName: 'Harry Brook', country: 'England', rating: 852 },
        { playerName: 'Joe Root', country: 'England', rating: 840 },
        { playerName: 'Steve Smith', country: 'Australia', rating: 831 },
        { playerName: 'Temba Bavuma', country: 'South Africa', rating: 775 },
        { playerName: 'Shubman Gill', country: 'India', rating: 743 },
        { playerName: 'Rachin Ravindra', country: 'New Zealand', rating: 740 },
        { playerName: 'Kamindu Mendis', country: 'Sri Lanka', rating: 737 },
        { playerName: 'Yashasvi Jaiswal', country: 'India', rating: 733 },
        { playerName: 'Dinesh Chandimal', country: 'Sri Lanka', rating: 725 },
      ],
      BOWLING: [
        { playerName: 'Jasprit Bumrah', country: 'India', rating: 870 },
        { playerName: 'Matt Henry', country: 'New Zealand', rating: 861 },
        { playerName: 'Mitchell Starc', country: 'Australia', rating: 838 },
        { playerName: 'Pat Cummins', country: 'Australia', rating: 832 },
        { playerName: 'Marco Jansen', country: 'South Africa', rating: 825 },
        { playerName: 'Scott Boland', country: 'Australia', rating: 820 },
        { playerName: 'Noman Ali', country: 'Pakistan', rating: 817 },
        { playerName: 'Kagiso Rabada', country: 'South Africa', rating: 807 },
        { playerName: 'Josh Hazlewood', country: 'Australia', rating: 775 },
        { playerName: 'Nathan Lyon', country: 'Australia', rating: 753 },
      ],
      ALLROUNDER: [
        { playerName: 'Ravindra Jadeja', country: 'India', rating: 446 },
        { playerName: 'Marco Jansen', country: 'South Africa', rating: 344 },
        { playerName: 'Ben Stokes', country: 'England', rating: 289 },
        { playerName: 'Mitchell Starc', country: 'Australia', rating: 284 },
        { playerName: 'Mehidy Hasan Miraz', country: 'Bangladesh', rating: 284 },
        { playerName: 'Pat Cummins', country: 'Australia', rating: 250 },
        { playerName: 'Wiaan Mulder', country: 'South Africa', rating: 245 },
        { playerName: 'Washington Sundar', country: 'India', rating: 244 },
        { playerName: 'Gus Atkinson', country: 'England', rating: 243 },
        { playerName: 'Joe Root', country: 'England', rating: 209 },
      ],
    },
  },
  ODI: {
    MEN: {
      BATTING: [
        { playerName: 'Daryl Mitchell', country: 'New Zealand', rating: 815 },
        { playerName: 'Shubman Gill', country: 'India', rating: 791 },
        { playerName: 'Virat Kohli', country: 'India', rating: 768 },
        { playerName: 'Rohit Sharma', country: 'India', rating: 754 },
        { playerName: 'Ibrahim Zadran', country: 'Afghanistan', rating: 712 },
        { playerName: 'Babar Azam', country: 'Pakistan', rating: 689 },
        { playerName: 'Shai Hope', country: 'West Indies', rating: 683 },
        { playerName: 'Harry Tector', country: 'Ireland', rating: 679 },
        { playerName: 'Charith Asalanka', country: 'Sri Lanka', rating: 659 },
        { playerName: 'Harry Brook', country: 'England', rating: 656 },
      ],
      BOWLING: [
        { playerName: 'Rashid Khan', country: 'Afghanistan', rating: 682 },
        { playerName: 'Abrar Ahmed', country: 'Pakistan', rating: 675 },
        { playerName: 'Jofra Archer', country: 'England', rating: 649 },
        { playerName: 'Keshav Maharaj', country: 'South Africa', rating: 645 },
        { playerName: 'Maheesh Theekshana', country: 'Sri Lanka', rating: 641 },
        { playerName: 'Adil Rashid', country: 'England', rating: 629 },
        { playerName: 'Kuldeep Yadav', country: 'India', rating: 614 },
        { playerName: 'Mehidy Hasan Miraz', country: 'Bangladesh', rating: 604 },
        { playerName: 'Shaheen Shah Afridi', country: 'Pakistan', rating: 604 },
        { playerName: 'Mitchell Santner', country: 'New Zealand', rating: 599 },
      ],
      ALLROUNDER: [
        { playerName: 'Azmatullah Omarzai', country: 'Afghanistan', rating: 316 },
        { playerName: 'Sikandar Raza', country: 'Zimbabwe', rating: 276 },
        { playerName: 'Mehidy Hasan Miraz', country: 'Bangladesh', rating: 262 },
        { playerName: 'Mohammad Nabi', country: 'Afghanistan', rating: 258 },
        { playerName: 'Michael Bracewell', country: 'New Zealand', rating: 230 },
        { playerName: 'Brandon McMullen', country: 'Scotland', rating: 228 },
        { playerName: 'Mitchell Santner', country: 'New Zealand', rating: 225 },
        { playerName: 'Rashid Khan', country: 'Afghanistan', rating: 220 },
        { playerName: 'Wanindu Hasaranga', country: 'Sri Lanka', rating: 205 },
        { playerName: 'Salman Ali Agha', country: 'Pakistan', rating: 193 },
      ],
    },
    WOMEN: {
      BATTING: [
        { playerName: 'Smriti Mandhana', country: 'India', rating: 790 },
        { playerName: 'Laura Wolvaardt', country: 'South Africa', rating: 782 },
        { playerName: 'Beth Mooney', country: 'Australia', rating: 744 },
        { playerName: 'Phoebe Litchfield', country: 'Australia', rating: 709 },
        { playerName: 'Ashleigh Gardner', country: 'Australia', rating: 696 },
        { playerName: 'Nat Sciver-Brunt', country: 'England', rating: 693 },
        { playerName: 'Maddy Green', country: 'New Zealand', rating: 685 },
        { playerName: 'Harmanpreet Kaur', country: 'India', rating: 652 },
        { playerName: 'Hayley Matthews', country: 'West Indies', rating: 651 },
        { playerName: 'Sidra Ameen', country: 'Pakistan', rating: 643 },
      ],
      BOWLING: [
        { playerName: 'Alana King', country: 'Australia', rating: 753 },
        { playerName: 'Sophie Ecclestone', country: 'England', rating: 717 },
        { playerName: 'Ashleigh Gardner', country: 'Australia', rating: 715 },
        { playerName: 'Hayley Matthews', country: 'West Indies', rating: 658 },
        { playerName: 'Marizanne Kapp', country: 'South Africa', rating: 650 },
        { playerName: 'Annabel Sutherland', country: 'Australia', rating: 646 },
        { playerName: 'Megan Schutt', country: 'Australia', rating: 624 },
        { playerName: 'Kim Garth', country: 'Australia', rating: 614 },
        { playerName: 'Deepti Sharma', country: 'India', rating: 614 },
        { playerName: 'Nahida Akter', country: 'Bangladesh', rating: 599 },
      ],
      ALLROUNDER: [
        { playerName: 'Ashleigh Gardner', country: 'Australia', rating: 497 },
        { playerName: 'Hayley Matthews', country: 'West Indies', rating: 428 },
        { playerName: 'Annabel Sutherland', country: 'Australia', rating: 385 },
        { playerName: 'Marizanne Kapp', country: 'South Africa', rating: 367 },
        { playerName: 'Amelia Kerr', country: 'New Zealand', rating: 358 },
        { playerName: 'Deepti Sharma', country: 'India', rating: 343 },
        { playerName: 'Alana King', country: 'Australia', rating: 281 },
        { playerName: 'Nat Sciver-Brunt', country: 'England', rating: 264 },
        { playerName: 'Chamari Athapaththu', country: 'Sri Lanka', rating: 262 },
        { playerName: 'Orla Prendergast', country: 'Ireland', rating: 254 },
      ],
    },
  },
  T20I: {
    MEN: {
      BATTING: [
        { playerName: 'Ishan Kishan', country: 'India', rating: 876 },
        { playerName: 'Abhishek Sharma', country: 'India', rating: 869 },
        { playerName: 'Sahibzada Farhan', country: 'Pakistan', rating: 848 },
        { playerName: 'Phil Salt', country: 'England', rating: 792 },
        { playerName: 'Pathum Nissanka', country: 'Sri Lanka', rating: 751 },
        { playerName: 'Tilak Varma', country: 'India', rating: 747 },
        { playerName: 'Jos Buttler', country: 'England', rating: 716 },
        { playerName: 'Suryakumar Yadav', country: 'India', rating: 708 },
        { playerName: 'Mitchell Marsh', country: 'Australia', rating: 706 },
        { playerName: 'Dewald Brevis', country: 'South Africa', rating: 702 },
      ],
      BOWLING: [
        { playerName: 'Rashid Khan', country: 'Afghanistan', rating: 753 },
        { playerName: 'Abrar Ahmed', country: 'Pakistan', rating: 736 },
        { playerName: 'Varun Chakravarthy', country: 'India', rating: 725 },
        { playerName: 'Adil Rashid', country: 'England', rating: 721 },
        { playerName: 'Adam Zampa', country: 'Australia', rating: 700 },
        { playerName: 'Jasprit Bumrah', country: 'India', rating: 688 },
        { playerName: 'Nathan Ellis', country: 'Australia', rating: 675 },
        { playerName: 'Corbin Bosch', country: 'South Africa', rating: 669 },
        { playerName: 'Wanindu Hasaranga', country: 'Sri Lanka', rating: 668 },
        { playerName: 'Mujeeb Ur Rahman', country: 'Afghanistan', rating: 663 },
      ],
      ALLROUNDER: [
        { playerName: 'Sikandar Raza', country: 'Zimbabwe', rating: 328 },
        { playerName: 'Hardik Pandya', country: 'India', rating: 287 },
        { playerName: 'Saim Ayub', country: 'Pakistan', rating: 275 },
        { playerName: 'Dipendra Singh Airee', country: 'Nepal', rating: 256 },
        { playerName: 'Roston Chase', country: 'West Indies', rating: 249 },
        { playerName: 'Azmatullah Omarzai', country: 'Afghanistan', rating: 241 },
        { playerName: 'Shivam Dube', country: 'India', rating: 220 },
        { playerName: 'Mohammad Nabi', country: 'Afghanistan', rating: 209 },
        { playerName: 'Jason Holder', country: 'West Indies', rating: 209 },
        { playerName: 'Mohammad Nawaz', country: 'Pakistan', rating: 203 },
      ],
    },
    WOMEN: {
      BATTING: [
        { playerName: 'Georgia Voll', country: 'Australia', rating: 808 },
        { playerName: 'Beth Mooney', country: 'Australia', rating: 774 },
        { playerName: 'Laura Wolvaardt', country: 'South Africa', rating: 765 },
        { playerName: 'Hayley Matthews', country: 'West Indies', rating: 754 },
        { playerName: 'Smriti Mandhana', country: 'India', rating: 746 },
        { playerName: 'Shafali Verma', country: 'India', rating: 717 },
        { playerName: 'Chamari Athapaththu', country: 'Sri Lanka', rating: 711 },
        { playerName: 'Amelia Kerr', country: 'New Zealand', rating: 696 },
        { playerName: 'Tahlia McGrath', country: 'Australia', rating: 693 },
        { playerName: 'Harmanpreet Kaur', country: 'India', rating: 667 },
      ],
      BOWLING: [
        { playerName: 'Shree Charani', country: 'India', rating: 759 },
        { playerName: 'Charlie Dean', country: 'England', rating: 726 },
        { playerName: 'Sophie Ecclestone', country: 'England', rating: 723 },
        { playerName: 'Lauren Bell', country: 'England', rating: 719 },
        { playerName: 'Nonkululeko Mlaba', country: 'South Africa', rating: 713 },
        { playerName: 'Linsey Smith', country: 'England', rating: 710 },
        { playerName: 'Sadia Iqbal', country: 'Pakistan', rating: 710 },
        { playerName: 'Deepti Sharma', country: 'India', rating: 703 },
        { playerName: 'Nashra Sandhu', country: 'Pakistan', rating: 693 },
        { playerName: 'Annabel Sutherland', country: 'Australia', rating: 686 },
      ],
      ALLROUNDER: [
        { playerName: 'Hayley Matthews', country: 'West Indies', rating: 501 },
        { playerName: 'Amelia Kerr', country: 'New Zealand', rating: 465 },
        { playerName: 'Chamari Athapaththu', country: 'Sri Lanka', rating: 376 },
        { playerName: 'Deepti Sharma', country: 'India', rating: 364 },
        { playerName: 'Orla Prendergast', country: 'Ireland', rating: 362 },
        { playerName: 'Fatima Sana', country: 'Pakistan', rating: 333 },
        { playerName: 'Ashleigh Gardner', country: 'Australia', rating: 332 },
        { playerName: 'Marizanne Kapp', country: 'South Africa', rating: 282 },
        { playerName: 'Sophie Ecclestone', country: 'England', rating: 272 },
        { playerName: 'Sophie Devine', country: 'New Zealand', rating: 260 },
      ],
    },
  },
};

export interface RankingSeedRow {
  playerName: string;
  country: string;
  format: string;
  role: string;
  gender: string;
  points: number;
  rating: number;
  position: number;
}

// Flatten to DB rows: position is the 1-based index within each
// format/gender/role list.
export const rankingRows: RankingSeedRow[] = Object.entries(RANKINGS).flatMap(([format, genders]) =>
  Object.entries(genders).flatMap(([gender, roles]) =>
    Object.entries(roles as RoleMap).flatMap(([role, rows]) =>
      rows.map((r, i) => ({
        playerName: r.playerName,
        country: r.country,
        format,
        role,
        gender,
        points: r.rating,
        rating: r.rating,
        position: i + 1,
      }))
    )
  )
);
